import type { ActionFile } from '../data/action_types'
import type {
    AgentConversation,
    BranchReference,
    CommitRequest,
    MarkdownFile,
    ProjectConfig,
    ProjectReference,
    StorageProjectFiles,
    StorageService,
} from '../data/data_types'
import { parseAgentConversationLog } from './agent_conversation_service'

const GITHUB_API_URL = 'https://api.github.com'
const GITHUB_API_VERSION = '2022-11-28'
const PROJECT_CONFIG_PATH = 'md2.config.json'
const TEXT_DECODER = new TextDecoder()

interface GithubStorageDependencies {
    accessToken: string
    fetchImplementation?: typeof fetch
}

interface GithubRepositoryResponse {
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

function requireString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing GitHub storage field: ${fieldName}`)

    return value
}

function encodePath(path: string) {
    return path.split('/').map(encodeURIComponent).join('/')
}

function encodeContent(content: string) {
    return btoa(unescape(encodeURIComponent(content)))
}

function decodeContent(content: string) {
    const binary = Uint8Array.from(atob(content.replace(/\s/gu, '')), (character) => character.charCodeAt(0))

    return TEXT_DECODER.decode(binary)
}

function normalizeRepository(payload: unknown): ProjectReference {
    const response = payload as GithubRepositoryResponse
    const owner = requireString(response.owner?.login, 'repository.owner.login')
    const repository = requireString(response.name, 'repository.name')

    return {
        branch: 'main',
        id: requireString(response.full_name, 'repository.full_name'),
        owner,
        repository,
    }
}

function normalizeBranches(payload: unknown): BranchReference[] {
    if (!Array.isArray(payload)) throw new Error('Missing GitHub storage field: branches')

    return payload.map((branch) => ({ name: requireString((branch as GithubBranchResponse).name, 'branch.name') }))
}

function normalizeDirectoryEntries(payload: unknown) {
    if (!Array.isArray(payload)) throw new Error('Missing GitHub storage field: directory entries')

    return payload as GithubContentResponse[]
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

export class GithubStorageService implements StorageService {
    private accessToken: string | null
    private activeProject: ProjectReference | null
    private fetchImplementation: typeof fetch | null

    constructor() {
        this.accessToken = null
        this.activeProject = null
        this.fetchImplementation = null
    }

    init(dependencies: GithubStorageDependencies) {
        this.accessToken = dependencies.accessToken
        this.activeProject = null
        this.fetchImplementation = dependencies.fetchImplementation ?? fetch
    }

    async createProject(project: ProjectReference, workingFolder: string) {
        this.requireGithubProject(project)
        await this.commit({
            branch: project.branch,
            files: [{
                content: '# MD2\n\nProject design folder created by MD2.\n',
                path: `${workingFolder}/README.md`,
            }],
            message: `Create ${workingFolder} workspace`,
        })

        return project
    }

    async loadProject(project: ProjectReference, workingFolder: string): Promise<StorageProjectFiles> {
        this.requireGithubProject(project)
        const files = await this.readDirectory(project, workingFolder)

        return { files, workingFolder }
    }

    async loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]> {
        this.requireGithubProject(project)
        const entries = await this.request(
            `/repos/${project.owner}/${project.repository}/contents/${encodePath(actionsFolder)}?ref=${encodeURIComponent(project.branch)}`,
            {},
            true,
        )
        if (entries === null) return []

        const files: ActionFile[] = []
        for (const entry of normalizeDirectoryEntries(entries)) {
            const type = requireString(entry.type, 'content.type')
            const entryPath = requireString(entry.path, 'content.path')
            if (type === 'file' && entryPath.toLowerCase().endsWith('.json')) {
                const jsonFile = await this.readFile(project, entryPath)
                files.push({ content: jsonFile.content, path: jsonFile.path })
            }
        }

        return files
    }

    async loadAgentConversation(project: ProjectReference, path: string): Promise<AgentConversation> {
        this.requireGithubProject(project)
        const file = await this.readFile(project, path)

        return parseAgentConversationLog(file.content, path)
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

    async checkoutBranch(project: ProjectReference, branch: string) {
        const { accessToken } = this.requireDependencies()
        if (accessToken.length === 0) throw new Error('Missing GitHub access token')

        this.requireGithubProject({ ...project, branch })

        return { ...project, branch }
    }

    async commit(request: CommitRequest) {
        for (const file of request.files) {
            await this.writeFile(request.branch, file, request.message)
        }
    }

    async saveProjectConfig(project: ProjectReference, config: ProjectConfig) {
        this.requireGithubProject(project)
        const existingFile = await this.readOptionalFile(project, PROJECT_CONFIG_PATH)
        await this.writeFile(project.branch, {
            content: `${JSON.stringify(config, null, 2)}\n`,
            path: PROJECT_CONFIG_PATH,
            sha: existingFile?.sha,
        }, 'Update MD2 project config')
    }

    async push() {
        const { accessToken } = this.requireDependencies()
        if (accessToken.length === 0) throw new Error('Missing GitHub access token')

        return Promise.resolve()
    }

    async findRepository(owner: string, repository: string) {
        const payload = await this.request(`/repos/${owner}/${repository}`)
        const project = normalizeRepository(payload)

        return { ...project, branch: project.branch }
    }

    private async readDirectory(project: ProjectReference, path: string): Promise<MarkdownFile[]> {
        const entries = normalizeDirectoryEntries(await this.request(
            `/repos/${project.owner}/${project.repository}/contents/${encodePath(path)}?ref=${encodeURIComponent(project.branch)}`,
        ))
        const files: MarkdownFile[] = []

        for (const entry of entries) {
            const type = requireString(entry.type, 'content.type')
            const entryPath = requireString(entry.path, 'content.path')

            if (type === 'dir') {
                files.push(...await this.readDirectory(project, entryPath))
                continue
            }

            if (type === 'file' && entryPath.toLowerCase().endsWith('.md')) {
                files.push(await this.readFile(project, entryPath))
            }
        }

        return files
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

    private async writeFile(branch: string, file: MarkdownFile, message: string) {
        const project = this.getCommitProject()
        const payload = {
            branch,
            content: encodeContent(file.content),
            message,
            sha: file.sha,
        }

        await this.request(`/repos/${project.owner}/${project.repository}/contents/${encodePath(file.path)}`, {
            body: JSON.stringify(payload),
            method: 'PUT',
        })
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
        if (!response.ok) throw new Error(`GitHub storage request failed with status ${response.status}`)

        return response.json()
    }

    private requireDependencies() {
        if (this.accessToken === null) throw new Error('GitHub storage access token is not initialized')
        if (!this.fetchImplementation) throw new Error('GitHub storage fetch implementation is not initialized')

        return { accessToken: this.accessToken, fetchImplementation: this.fetchImplementation }
    }
}
