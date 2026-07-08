import type { ActionFile } from '../data/action_types'
import { ACTION_SCHEDULES_FILE } from '../data/action_schedule_types'
import { MissingWorkingFolderError } from '../data/data_types'
import { GithubUnauthorizedError } from '../auth/github_api_client'
import type {
    AgentConversation,
    BranchReference,
    CommitResult,
    CommitRequest,
    DeleteFileRequest,
    MarkdownFile,
    MoveFilesRequest,
    ProjectConfig,
    ProjectReference,
    RepositoryReference,
    StorageProjectFiles,
    StorageService,
} from '../data/data_types'
import { parseAgentConversationLog } from './agent_conversation_service'
import { mapWithConcurrency } from './concurrency'

const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'
const GITHUB_PAGE_SIZE = 100
const GITHUB_STORAGE_CONCURRENCY = 8
const PROJECT_CONFIG_PATH = 'md2.config.json'
export const PROJECT_README_TEMPLATE = '# MD2\n\nProject design folder created by MD2.\n'
const TEXT_DECODER = new TextDecoder()

interface GithubStorageDependencies {
    accessToken: string
    fetchImplementation?: typeof fetch
    onUnauthorized?: () => void
}

interface GithubRepositoryResponse {
    default_branch?: unknown
    full_name?: unknown
    name?: unknown
    owner?: { login?: unknown }
}

interface GithubBranchResponse {
    name?: unknown
}

interface GithubContentResponse {
    content?: unknown
    download_url?: unknown
    encoding?: unknown
    name?: unknown
    path?: unknown
    sha?: unknown
    type?: unknown
}

interface GithubGitRefResponse {
    object?: { sha?: unknown, type?: unknown }
    ref?: unknown
}

interface GithubGitBlobResponse {
    sha?: unknown
}

interface GithubGitTreeResponse {
    sha?: unknown
    tree?: unknown
    truncated?: unknown
}

interface GithubGitCommitResponse {
    sha?: unknown
    tree?: { sha?: unknown }
}

interface GithubTreeFile {
    path: string
    sha: string
}

interface GithubTreeDelete {
    path: string
    sha: null
}

interface GithubTreeEntry {
    path?: unknown
    sha?: unknown
    type?: unknown
}

interface NormalizedGithubTreeEntry {
    path: string
    sha: string
    type: string
}

interface GithubBranchHead {
    commitSha: string
    treeSha: string
}

interface PendingCommitHead {
    baseSha: string
    headSha: string
}

type GithubTreeChange = GithubTreeDelete | GithubTreeFile

const PENDING_COMMIT_HEADS_STORAGE_KEY = 'md2.github.pendingCommitHeads'
const PENDING_CONFLICT_MESSAGE = 'Unpushed GitHub commits conflict with the current branch. Discard pending commits or resolve the branch manually before opening this project.'

function requireString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing GitHub storage field: ${fieldName}`)

    return value
}

function encodePath(path: string) {
    return path.split('/').map(encodeURIComponent).join('/')
}

function decodeContent(content: string) {
    const binary = Uint8Array.from(atob(content.replace(/\s/gu, '')), (character) => character.charCodeAt(0))

    return TEXT_DECODER.decode(binary)
}

function normalizeRepository(payload: unknown): RepositoryReference {
    const response = payload as GithubRepositoryResponse
    const owner = requireString(response.owner?.login, 'repository.owner.login')
    const repository = requireString(response.name, 'repository.name')
    const defaultBranch = typeof response.default_branch === 'string' && response.default_branch.length > 0
        ? response.default_branch
        : 'main'

    return {
        branch: defaultBranch,
        id: requireString(response.full_name, 'repository.full_name'),
        owner,
        repository,
    }
}

function normalizeRepositories(payload: unknown): RepositoryReference[] {
    if (!Array.isArray(payload)) throw new Error('Missing GitHub storage field: repositories')

    return payload.map((repository) => normalizeRepository(repository))
}

function normalizeBranches(payload: unknown): BranchReference[] {
    if (!Array.isArray(payload)) throw new Error('Missing GitHub storage field: branches')

    return payload.map((branch) => ({ name: requireString((branch as GithubBranchResponse).name, 'branch.name') }))
}

function normalizeFileContent(payload: unknown): MarkdownFile {
    const response = payload as GithubContentResponse
    const encoding = requireString(response.encoding, 'content.encoding')

    if (encoding !== 'base64') throw new Error(`Unsupported GitHub content encoding: ${encoding}`)

    return {
        content: decodeContent(requireString(response.content, 'content.content')),
        path: requireString(response.path, 'content.path'),
        sha: requireString(response.sha, 'content.sha'),
    }
}

function contentTypeForPath(path: string) {
    const extension = path.toLowerCase().split('.').pop()
    if (extension === 'svg') return 'image/svg+xml'
    if (extension === 'png') return 'image/png'
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
    if (extension === 'gif') return 'image/gif'
    if (extension === 'webp') return 'image/webp'

    return 'application/octet-stream'
}

function normalizeProjectAsset(payload: unknown) {
    const response = payload as GithubContentResponse
    const encoding = requireString(response.encoding, 'content.encoding')
    if (encoding !== 'base64') throw new Error(`Unsupported GitHub content encoding: ${encoding}`)

    const path = requireString(response.path, 'content.path')

    return {
        content: requireString(response.content, 'content.content').replace(/\s/gu, ''),
        contentType: contentTypeForPath(path),
        encoding: 'base64' as const,
        path,
    }
}

function normalizeGitRef(payload: unknown) {
    const response = payload as GithubGitRefResponse
    const objectType = requireString(response.object?.type, 'gitRef.object.type')
    if (objectType !== 'commit') throw new Error(`Unsupported GitHub ref object type: ${objectType}`)

    return {
        commitSha: requireString(response.object?.sha, 'gitRef.object.sha'),
        ref: requireString(response.ref, 'gitRef.ref'),
    }
}

function normalizeGitBlob(payload: unknown) {
    const response = payload as GithubGitBlobResponse

    return { sha: requireString(response.sha, 'gitBlob.sha') }
}

function normalizeGitTree(payload: unknown) {
    const response = payload as GithubGitTreeResponse

    return { sha: requireString(response.sha, 'gitTree.sha') }
}

function normalizeRecursiveGitTree(payload: unknown) {
    const entries = normalizeRecursiveGitTreeEntries(payload)
    const blobs = new Map<string, string>()

    for (const entry of entries) {
        if (entry.type === 'blob') blobs.set(entry.path, entry.sha)
    }

    return blobs
}

function normalizeRecursiveGitTreeEntries(payload: unknown) {
    const response = payload as GithubGitTreeResponse
    if (response.truncated === true) throw new Error('GitHub tree is too large to verify stale file shas.')
    if (!Array.isArray(response.tree)) throw new Error('Missing GitHub storage field: gitTree.tree')

    const entries: NormalizedGithubTreeEntry[] = []

    for (const entry of response.tree as GithubTreeEntry[]) {
        entries.push({
            path: requireString(entry.path, 'gitTree.entry.path').replace(/\\/gu, '/'),
            sha: requireString(entry.sha, 'gitTree.entry.sha'),
            type: requireString(entry.type, 'gitTree.entry.type'),
        })
    }

    return entries
}

function normalizeGitCommit(payload: unknown) {
    const response = payload as GithubGitCommitResponse

    return {
        sha: requireString(response.sha, 'gitCommit.sha'),
        treeSha: requireString(response.tree?.sha, 'gitCommit.tree.sha'),
    }
}

function sortPaths(paths: string[]) {
    return [...paths].sort((left, right) => left.localeCompare(right))
}

function normalizeFolderPath(path: string) {
    return path.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
}

function isEntryInFolder(entryPath: string, folderPath: string) {
    if (folderPath.length === 0) return true

    return entryPath === folderPath || entryPath.startsWith(`${folderPath}/`)
}

function isDirectFileInFolder(entryPath: string, folderPath: string) {
    const normalizedPath = entryPath.replace(/\\/gu, '/')
    if (folderPath.length === 0) return !normalizedPath.includes('/')
    if (!normalizedPath.startsWith(`${folderPath}/`)) return false

    return !normalizedPath.slice(folderPath.length + 1).includes('/')
}

function isTopLevelTree(entry: NormalizedGithubTreeEntry) {
    return entry.type === 'tree' && !entry.path.includes('/')
}

function isMarkdownBlob(entry: NormalizedGithubTreeEntry) {
    return entry.type === 'blob' && entry.path.toLowerCase().endsWith('.md')
}

function isJsonActionBlob(entry: NormalizedGithubTreeEntry, actionsFolder: string) {
    const fileName = entry.path.split('/').pop()

    return entry.type === 'blob'
        && fileName !== ACTION_SCHEDULES_FILE
        && entry.path.toLowerCase().endsWith('.json')
        && isDirectFileInFolder(entry.path, actionsFolder)
}

function createPendingHeadKey(project: ProjectReference) {
    if (!project.owner) throw new Error('Missing GitHub project owner')
    if (!project.repository) throw new Error('Missing GitHub project repository')

    return `${project.owner}/${project.repository}:${project.branch}`
}

function readStoredPendingCommitHeads() {
    const storedValue = window.localStorage.getItem(PENDING_COMMIT_HEADS_STORAGE_KEY)
    if (!storedValue) return new Map<string, PendingCommitHead>()

    const parsedValue = JSON.parse(storedValue) as Record<string, PendingCommitHead>

    return new Map(Object.entries(parsedValue))
}

function writeStoredPendingCommitHeads(pendingCommitHeads: Map<string, PendingCommitHead>) {
    const storedValue = Object.fromEntries(pendingCommitHeads)

    if (Object.keys(storedValue).length === 0) {
        window.localStorage.removeItem(PENDING_COMMIT_HEADS_STORAGE_KEY)

        return
    }

    window.localStorage.setItem(PENDING_COMMIT_HEADS_STORAGE_KEY, JSON.stringify(storedValue))
}

export class GithubPendingCommitConflictError extends Error {
    project: ProjectReference

    constructor(project: ProjectReference) {
        super(PENDING_CONFLICT_MESSAGE)
        this.project = project
    }
}

export class GithubStorageService implements StorageService {
    private accessToken: string | null
    private activeProject: ProjectReference | null
    private fetchImplementation: typeof fetch | null
    private onUnauthorized: (() => void) | null
    private pendingCommitHeads: Map<string, PendingCommitHead>
    private projectTreeEntriesByHead: Map<string, NormalizedGithubTreeEntry[]>
    private recursiveTreeEntriesBySha: Map<string, Map<string, string>>

    constructor() {
        this.accessToken = null
        this.activeProject = null
        this.fetchImplementation = null
        this.onUnauthorized = null
        this.pendingCommitHeads = new Map()
        this.projectTreeEntriesByHead = new Map()
        this.recursiveTreeEntriesBySha = new Map()
    }

    init(dependencies: GithubStorageDependencies) {
        this.accessToken = dependencies.accessToken
        this.activeProject = null
        this.fetchImplementation = dependencies.fetchImplementation ?? fetch
        this.onUnauthorized = dependencies.onUnauthorized ?? null
        this.pendingCommitHeads = readStoredPendingCommitHeads()
        this.projectTreeEntriesByHead = new Map()
        this.recursiveTreeEntriesBySha = new Map()
    }

    async createProject(project: ProjectReference, workingFolder: string) {
        return this.createWorkingFolderFromTemplate(project, workingFolder)
    }

    async createWorkingFolderFromTemplate(project: ProjectReference, workingFolder: string) {
        this.requireGithubProject(project)
        await this.commit({
            branch: project.branch,
            files: [{
                content: PROJECT_README_TEMPLATE,
                path: `${workingFolder}/README.md`,
            }],
            message: `Create ${workingFolder} workspace`,
        })

        return project
    }

    async loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles> {
        this.requireGithubProject(project)
        const files = await this.readDirectory(project, workingFolder, true)

        return { files, workingFolder }
    }

    async loadProjectRoot(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles> {
        this.requireGithubProject(project)
        const files = await this.readRootMarkdownFiles(project, workingFolder)

        return { files, workingFolder }
    }

    async loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]> {
        this.requireGithubProject(project)
        const folderPath = normalizeFolderPath(actionsFolder)
        const entries = await this.getProjectRecursiveTreeEntries(project)
        const folderExists = entries.some((entry) => isEntryInFolder(entry.path, folderPath))
        if (!folderExists) return []

        const actionEntries = entries.filter((entry) => isJsonActionBlob(entry, folderPath))
        const files = await mapWithConcurrency(
            actionEntries,
            GITHUB_STORAGE_CONCURRENCY,
            async (entry) => this.readBlobFile(project, entry),
        )

        return files.map((file) => ({ content: file.content, path: file.path }))
    }

    async loadAgentConversation(project: ProjectReference, path: string): Promise<AgentConversation> {
        this.requireGithubProject(project)
        const file = await this.readFile(project, path)

        return parseAgentConversationLog(file.content, path)
    }

    async loadProjectAsset(project: ProjectReference, path: string) {
        this.requireGithubProject(project)
        const payload = await this.request(
            `/repos/${project.owner}/${project.repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(project.branch)}`,
        )

        return normalizeProjectAsset(payload)
    }

    async loadProjectConfig(project: ProjectReference): Promise<Partial<ProjectConfig> | null> {
        this.requireGithubProject(project)
        const file = await this.readOptionalFile(project, PROJECT_CONFIG_PATH)
        if (!file) return null

        return JSON.parse(file.content) as Partial<ProjectConfig>
    }

    async listBranches(project: ProjectReference) {
        this.requireGithubProject(project)
        const payload = await this.request(`/repos/${project.owner}/${project.repository}/branches`)

        return normalizeBranches(payload)
    }

    async listRepositories() {
        const repositories: RepositoryReference[] = []
        let page = 1
        let hasMorePages = true

        while (hasMorePages) {
            const payload = await this.request(`/user/repos?per_page=${GITHUB_PAGE_SIZE}&page=${page}`)
            const pageRepositories = normalizeRepositories(payload)
            repositories.push(...pageRepositories)
            hasMorePages = pageRepositories.length === GITHUB_PAGE_SIZE
            page += 1
        }

        return repositories
    }

    async listRepositoryFiles(project: ProjectReference) {
        this.requireGithubProject(project)

        const entries = await this.getProjectRecursiveTreeEntries(project)

        return sortPaths(entries
            .filter((entry) => entry.type === 'blob')
            .map((entry) => entry.path))
    }

    async listTopLevelFolders(project: ProjectReference) {
        this.requireGithubProject(project)
        const entries = await this.getProjectRecursiveTreeEntries(project)

        return entries
            .filter(isTopLevelTree)
            .map((entry) => ({ name: entry.path, path: entry.path }))
    }

    async checkoutBranch(project: ProjectReference, branch: string) {
        const { accessToken } = this.requireDependencies()
        if (accessToken.length === 0) throw new Error('Missing GitHub access token')

        this.requireGithubProject({ ...project, branch })

        return { ...project, branch }
    }

    async commit(request: CommitRequest): Promise<CommitResult> {
        const branchHead = await this.getBranchHead(request.branch)
        await this.assertFileShasMatch(branchHead.treeSha, request.files)

        const updatedFiles: MarkdownFile[] = []
        const treeFiles: GithubTreeFile[] = []
        const blobs = await mapWithConcurrency(request.files, GITHUB_STORAGE_CONCURRENCY, async (file) => this.createBlob(file))

        for (const [index, file] of request.files.entries()) {
            const blob = blobs[index]
            updatedFiles.push({ ...file, sha: blob.sha })
            treeFiles.push({ path: file.path, sha: blob.sha })
        }

        await this.createPendingCommit(request.branch, request.message, branchHead, treeFiles)

        return updatedFiles
    }

    async deleteFile(request: DeleteFileRequest) {
        if (!request.sha) throw new Error(`Cannot delete GitHub file without sha: ${request.path}`)

        const branchHead = await this.getBranchHead(request.branch)
        await this.assertPathShasMatch(branchHead.treeSha, [{ path: request.path, sha: request.sha }])
        await this.createPendingCommit(request.branch, request.message, branchHead, [{ path: request.path, sha: null }])
    }

    async moveFiles(request: MoveFilesRequest) {
        const sourceFiles: GithubTreeFile[] = []
        for (const move of request.moves) {
            if (!move.sha) throw new Error(`Cannot delete GitHub file without sha: ${move.fromPath}`)
            sourceFiles.push({ path: move.fromPath, sha: move.sha })
        }

        const branchHead = await this.getBranchHead(request.branch)
        await this.assertPathShasMatch(branchHead.treeSha, sourceFiles)

        const treeChanges: GithubTreeChange[] = []
        const blobs = await mapWithConcurrency(request.moves, GITHUB_STORAGE_CONCURRENCY, async (move) => this.createBlob({
            content: move.content,
            encoding: move.encoding,
            path: move.toPath,
        }))

        for (const [index, move] of request.moves.entries()) {
            const blob = blobs[index]
            treeChanges.push({ path: move.toPath, sha: blob.sha })
            treeChanges.push({ path: move.fromPath, sha: null })
        }

        await this.createPendingCommit(request.branch, request.message, branchHead, treeChanges)
    }

    async saveProjectConfig(project: ProjectReference, config: ProjectConfig) {
        this.requireGithubProject(project)
        const existingFile = await this.readOptionalFile(project, PROJECT_CONFIG_PATH)
        await this.commit({
            branch: project.branch,
            files: [{
                content: `${JSON.stringify(config, null, 2)}\n`,
                path: PROJECT_CONFIG_PATH,
                sha: existingFile?.sha,
            }],
            message: 'Update MD2 project config',
        })
    }

    async push(project: ProjectReference) {
        const { accessToken } = this.requireDependencies()
        if (accessToken.length === 0) throw new Error('Missing GitHub access token')

        this.requireGithubProject(project)
        const pendingHeadKey = createPendingHeadKey(project)
        const pendingCommitHead = this.pendingCommitHeads.get(pendingHeadKey)
        if (!pendingCommitHead) return Promise.resolve()

        await this.updateBranchRef(project.branch, pendingCommitHead.headSha)
        this.pendingCommitHeads.delete(pendingHeadKey)
        writeStoredPendingCommitHeads(this.pendingCommitHeads)

        return Promise.resolve()
    }

    async restorePendingCommits(project: ProjectReference) {
        this.requireGithubProject(project)
        const pendingHeadKey = createPendingHeadKey(project)
        const storedPendingHead = readStoredPendingCommitHeads().get(pendingHeadKey)
        if (!storedPendingHead) return

        const gitRef = normalizeGitRef(await this.request(
            `/repos/${project.owner}/${project.repository}/git/ref/heads/${encodePath(project.branch)}`,
        ))
        if (gitRef.commitSha !== storedPendingHead.baseSha) throw new GithubPendingCommitConflictError(project)

        const pendingCommit = await this.getOptionalCommit(storedPendingHead.headSha)
        if (!pendingCommit) throw new GithubPendingCommitConflictError(project)

        this.pendingCommitHeads.set(pendingHeadKey, storedPendingHead)
    }

    hasPendingCommits(project: ProjectReference) {
        return this.pendingCommitHeads.has(createPendingHeadKey(project))
    }

    discardPendingCommits(project: ProjectReference) {
        const pendingHeadKey = createPendingHeadKey(project)
        this.pendingCommitHeads.delete(pendingHeadKey)
        const storedPendingHeads = readStoredPendingCommitHeads()
        storedPendingHeads.delete(pendingHeadKey)
        writeStoredPendingCommitHeads(storedPendingHeads)
    }

    async findRepository(owner: string, repository: string) {
        const payload = await this.request(`/repos/${owner}/${repository}`)
        const project = normalizeRepository(payload)

        return { ...project, branch: project.branch }
    }

    private async readDirectory(project: ProjectReference, path: string, isWorkingFolder = false): Promise<MarkdownFile[]> {
        const folderPath = normalizeFolderPath(path)
        const entries = await this.getProjectRecursiveTreeEntries(project)
        const folderExists = folderPath.length === 0 || entries.some((entry) => isEntryInFolder(entry.path, folderPath))
        if (!folderExists && isWorkingFolder) throw new MissingWorkingFolderError(path)

        const markdownEntries = entries.filter((entry) => isMarkdownBlob(entry) && isEntryInFolder(entry.path, folderPath))

        return mapWithConcurrency(markdownEntries, GITHUB_STORAGE_CONCURRENCY, async (entry) => this.readBlobFile(project, entry))
    }

    private async readRootMarkdownFiles(project: ProjectReference, path: string): Promise<MarkdownFile[]> {
        const folderPath = normalizeFolderPath(path)
        const entries = await this.getProjectRecursiveTreeEntries(project)
        const folderExists = folderPath.length === 0 || entries.some((entry) => isEntryInFolder(entry.path, folderPath))
        if (!folderExists) throw new MissingWorkingFolderError(path)

        const markdownEntries = entries.filter((entry) => isMarkdownBlob(entry) && isDirectFileInFolder(entry.path, folderPath))

        return mapWithConcurrency(markdownEntries, GITHUB_STORAGE_CONCURRENCY, async (entry) => this.readBlobFile(project, entry))
    }

    private async readFile(project: ProjectReference, path: string) {
        const payload = await this.request(
            `/repos/${project.owner}/${project.repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(project.branch)}`,
        )

        return normalizeFileContent(payload)
    }

    private async readOptionalFile(project: ProjectReference, path: string) {
        const payload = await this.request(
            `/repos/${project.owner}/${project.repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(project.branch)}`,
            {},
            true,
        )
        if (payload === null) return null

        return normalizeFileContent(payload)
    }

    private async readBlobFile(project: ProjectReference, entry: NormalizedGithubTreeEntry): Promise<MarkdownFile> {
        const requestInit = { headers: { Accept: 'application/vnd.github.raw' } }
        const content = await this.requestText(`/repos/${project.owner}/${project.repository}/git/blobs/${entry.sha}`, requestInit)

        return { content, path: entry.path, sha: entry.sha }
    }

    private async getBranchHead(branch: string): Promise<GithubBranchHead> {
        const project = this.getCommitProject()
        const pendingCommitHead = this.pendingCommitHeads.get(createPendingHeadKey({ ...project, branch }))
        if (pendingCommitHead) {
            const pendingCommit = await this.getCommit(pendingCommitHead.headSha)

            return { commitSha: pendingCommit.sha, treeSha: pendingCommit.treeSha }
        }

        const gitRef = normalizeGitRef(await this.request(
            `/repos/${project.owner}/${project.repository}/git/ref/heads/${encodePath(branch)}`,
        ))
        const gitCommit = await this.getCommit(gitRef.commitSha)

        return { commitSha: gitRef.commitSha, treeSha: gitCommit.treeSha }
    }

    private async getProjectRecursiveTreeEntries(project: ProjectReference) {
        const { treeSha } = await this.getBranchHead(project.branch)
        const cacheKey = `${createPendingHeadKey(project)}:${treeSha}`
        const cachedEntries = this.projectTreeEntriesByHead.get(cacheKey)
        if (cachedEntries) return cachedEntries

        const response = await this.request(`/repos/${project.owner}/${project.repository}/git/trees/${treeSha}?recursive=1`)
        const entries = normalizeRecursiveGitTreeEntries(response)
        this.projectTreeEntriesByHead.set(cacheKey, entries)

        return entries
    }

    private async assertFileShasMatch(treeSha: string, files: MarkdownFile[]) {
        const filesWithSha: GithubTreeFile[] = []
        for (const file of files) {
            if (file.sha) filesWithSha.push({ path: file.path, sha: file.sha })
        }

        await this.assertPathShasMatch(treeSha, filesWithSha)
    }

    private async assertPathShasMatch(treeSha: string, files: GithubTreeFile[]) {
        if (files.length === 0) return

        const treeEntries = await this.getRecursiveTreeEntries(treeSha)
        for (const file of files) {
            if (treeEntries.get(file.path) !== file.sha) {
                throw new Error('The file changed remotely. Reload or refresh the project before saving again.')
            }
        }
    }

    private async getRecursiveTreeEntries(treeSha: string) {
        const cachedEntries = this.recursiveTreeEntriesBySha.get(treeSha)
        if (cachedEntries) return cachedEntries

        const project = this.getCommitProject()
        const response = await this.request(`/repos/${project.owner}/${project.repository}/git/trees/${treeSha}?recursive=1`)
        const treeEntries = normalizeRecursiveGitTree(response)
        this.recursiveTreeEntriesBySha.set(treeSha, treeEntries)

        return treeEntries
    }

    private async createBlob(file: MarkdownFile) {
        const project = this.getCommitProject()
        const payload = {
            content: file.content,
            encoding: file.encoding ?? 'utf-8',
        }
        const response = await this.request(`/repos/${project.owner}/${project.repository}/git/blobs`, {
            body: JSON.stringify(payload),
            method: 'POST',
        })

        return normalizeGitBlob(response)
    }

    private async createTree(baseTreeSha: string, files: GithubTreeChange[]) {
        const project = this.getCommitProject()
        const tree = files.map((file) => ({ mode: '100644', path: file.path, sha: file.sha, type: 'blob' }))
        const payload = { base_tree: baseTreeSha, tree }
        const response = await this.request(`/repos/${project.owner}/${project.repository}/git/trees`, {
            body: JSON.stringify(payload),
            method: 'POST',
        })

        return normalizeGitTree(response)
    }

    private async createCommit(message: string, treeSha: string, parentSha: string) {
        const project = this.getCommitProject()
        const payload = { message, parents: [parentSha], tree: treeSha }
        const response = await this.request(`/repos/${project.owner}/${project.repository}/git/commits`, {
            body: JSON.stringify(payload),
            method: 'POST',
        })

        return normalizeGitCommit(response)
    }

    private async createPendingCommit(branch: string, message: string, branchHead: GithubBranchHead, treeChanges: GithubTreeChange[]) {
        const tree = await this.createTree(branchHead.treeSha, treeChanges)
        const commit = await this.createCommit(message, tree.sha, branchHead.commitSha)
        const project = this.getCommitProject()
        const pendingHeadKey = createPendingHeadKey({ ...project, branch })
        const existingPendingHead = this.pendingCommitHeads.get(pendingHeadKey)
        this.pendingCommitHeads.set(pendingHeadKey, {
            baseSha: existingPendingHead?.baseSha ?? branchHead.commitSha,
            headSha: commit.sha,
        })
        writeStoredPendingCommitHeads(this.pendingCommitHeads)
    }

    private async updateBranchRef(branch: string, commitSha: string) {
        const project = this.getCommitProject()
        const payload = { force: false, sha: commitSha }

        await this.request(`/repos/${project.owner}/${project.repository}/git/refs/heads/${encodePath(branch)}`, {
            body: JSON.stringify(payload),
            method: 'PATCH',
        })
    }

    private async getCommit(commitSha: string) {
        const project = this.getCommitProject()
        const response = await this.request(`/repos/${project.owner}/${project.repository}/git/commits/${commitSha}`)

        return normalizeGitCommit(response)
    }

    private async getOptionalCommit(commitSha: string) {
        const project = this.getCommitProject()
        const response = await this.request(`/repos/${project.owner}/${project.repository}/git/commits/${commitSha}`, {}, true)
        if (response === null) return null

        return normalizeGitCommit(response)
    }

    private getCommitProject() {
        if (!this.activeProject) throw new Error('Cannot commit before a GitHub project is loaded')

        return this.activeProject
    }

    private requireGithubProject(project: ProjectReference) {
        if (!project.owner) throw new Error('Missing GitHub project owner')
        if (!project.repository) throw new Error('Missing GitHub project repository')

        this.activeProject = project
    }

    private async request(path: string, init: RequestInit = {}, allowNotFound = false) {
        const { accessToken, fetchImplementation } = this.requireDependencies()
        const response = await fetchImplementation(`${GITHUB_API_URL}${path}`, {
            ...init,
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': GITHUB_API_VERSION,
                ...init.headers,
            },
        })

        if (allowNotFound && response.status === 404) return null
        if ((init.method === 'PATCH' || init.method === 'PUT') && (response.status === 409 || response.status === 422)) {
            throw new Error('The file changed remotely. Reload or refresh the project before saving again.')
        }
        if (response.status === 401) {
            this.onUnauthorized?.()
            throw new GithubUnauthorizedError()
        }
        if (!response.ok) throw new Error(`GitHub storage request failed with status ${response.status}`)

        return response.json()
    }

    private async requestText(path: string, init: RequestInit = {}) {
        const { accessToken, fetchImplementation } = this.requireDependencies()
        const response = await fetchImplementation(`${GITHUB_API_URL}${path}`, {
            ...init,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'X-GitHub-Api-Version': GITHUB_API_VERSION,
                ...init.headers,
            },
        })

        if (response.status === 401) {
            this.onUnauthorized?.()
            throw new GithubUnauthorizedError()
        }
        if (!response.ok) throw new Error(`GitHub storage request failed with status ${response.status}`)

        return response.text()
    }

    private requireDependencies() {
        if (this.accessToken === null) throw new Error('GitHub storage access token is not initialized')
        if (!this.fetchImplementation) throw new Error('GitHub storage fetch implementation is not initialized')

        return { accessToken: this.accessToken, fetchImplementation: this.fetchImplementation }
    }
}
