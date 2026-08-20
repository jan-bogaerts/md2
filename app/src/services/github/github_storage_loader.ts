import type { ActionFile } from '../../data/action_types'
import { ACTION_SCHEDULES_FILE } from '../../data/action_schedule_types'
import { MissingWorkingFolderError, type AgentConversation, type MarkdownFile, type ProjectReference } from '../../data/data_types'
import { findActivityConversation, parseActivityFile } from '../../../../shared/card_activity.mjs'
import { conversationActivityReference, parseConversationActivityReference } from '../../../../shared/activity_paths.mjs'
import {
    normalizeBranches,
    normalizeProjectAsset,
    normalizeRepositories,
    normalizeRepository,
    requirePublicRepository,
} from './github_storage_normalizers'
import type { GithubStorageContext } from './github_storage_context'
import type { GithubStorageGitData } from './github_storage_git_data'
import type { NormalizedGithubTreeEntry } from './github_storage_types'
import { encodeGithubPath, GITHUB_PAGE_SIZE } from './github_storage_types'

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

export class GithubStorageLoader {
    private readonly context: GithubStorageContext
    private readonly gitData: GithubStorageGitData

    constructor(context: GithubStorageContext, gitData: GithubStorageGitData) {
        this.context = context
        this.gitData = gitData
    }

    async loadProject(project: ProjectReference, workingFolder: string) {
        this.context.requireGithubProject(project)
        const files = await this.readDirectory(project, workingFolder, true)

        return { files, workingFolder }
    }

    async loadProjectRoot(project: ProjectReference, workingFolder: string) {
        this.context.requireGithubProject(project)
        const files = await this.readRootMarkdownFiles(project, workingFolder)

        return { files, workingFolder }
    }

    async loadActionFiles(project: ProjectReference, actionsFolder: string): Promise<ActionFile[]> {
        this.context.requireGithubProject(project)
        const folderPath = normalizeFolderPath(actionsFolder)
        const entries = await this.gitData.getProjectRecursiveTreeEntries(project)
        const folderExists = entries.some((entry) => isEntryInFolder(entry.path, folderPath))
        if (!folderExists) return []

        const actionEntries = entries.filter((entry) => isJsonActionBlob(entry, folderPath))
        const files = await this.gitData.readBlobFiles(project, actionEntries)

        return files.map((file) => ({ content: file.content, path: file.path }))
    }

    async loadAgentConversation(project: ProjectReference, path: string): Promise<AgentConversation> {
        this.context.requireGithubProject(project)
        const { activityPath, conversationId } = parseConversationActivityReference(path)
        const file = await this.gitData.readFile(project, activityPath)
        const activity = parseActivityFile(file.content)
        const conversation = findActivityConversation(activity, conversationId)

        return { ...conversation, path }
    }

    async loadActivityConversations(project: ProjectReference, path: string): Promise<AgentConversation[]> {
        this.context.requireGithubProject(project)
        const file = await this.gitData.readFile(project, path)
        const activity = parseActivityFile(file.content)

        return activity.conversations.map((conversation) => ({
            ...conversation,
            path: conversationActivityReference(path, conversation.id),
        }))
    }

    async loadProjectAsset(project: ProjectReference, path: string) {
        this.context.requireGithubProject(project)
        const payload = await this.context.getApiClient().requestJson(
            `/repos/${project.owner}/${project.repository}/contents/${encodeGithubPath(path)}?ref=${encodeURIComponent(project.branch)}`,
        )

        return normalizeProjectAsset(payload)
    }

    async loadTextFile(project: ProjectReference, path: string) {
        this.context.requireGithubProject(project)

        return this.gitData.readFile(project, path)
    }

    async listBranches(project: ProjectReference) {
        this.context.requireGithubProject(project)
        const payload = await this.context.getApiClient().requestJson(`/repos/${project.owner}/${project.repository}/branches`)

        return normalizeBranches(payload)
    }

    async listRepositories() {
        const repositories = []
        let page = 1
        let hasMorePages = true

        while (hasMorePages) {
            const payload = await this.context.getApiClient().requestJson(`/user/repos?per_page=${GITHUB_PAGE_SIZE}&page=${page}`)
            const pageRepositories = normalizeRepositories(payload)
            repositories.push(...pageRepositories)
            hasMorePages = pageRepositories.length === GITHUB_PAGE_SIZE
            page += 1
        }

        return repositories
    }

    async listRepositoryFiles(project: ProjectReference) {
        this.context.requireGithubProject(project)
        const entries = await this.gitData.getProjectRecursiveTreeEntries(project)

        return sortPaths(entries
            .filter((entry) => entry.type === 'blob')
            .map((entry) => entry.path))
    }

    async listTopLevelFolders(project: ProjectReference) {
        this.context.requireGithubProject(project)
        const entries = await this.gitData.getProjectRecursiveTreeEntries(project)

        return entries
            .filter(isTopLevelTree)
            .map((entry) => ({ name: entry.path, path: entry.path }))
    }

    async findRepository(owner: string, repository: string, requirePublic: boolean) {
        const payload = await this.context.getApiClient().requestJson(`/repos/${owner}/${repository}`)
        if (requirePublic) requirePublicRepository(payload)
        const project = normalizeRepository(payload)

        return { ...project, branch: project.branch }
    }

    private async readDirectory(project: ProjectReference, path: string, isWorkingFolder = false): Promise<MarkdownFile[]> {
        const folderPath = normalizeFolderPath(path)
        const entries = await this.gitData.getProjectRecursiveTreeEntries(project)
        const folderExists = folderPath.length === 0 || entries.some((entry) => isEntryInFolder(entry.path, folderPath))
        if (!folderExists && isWorkingFolder) throw new MissingWorkingFolderError(path)

        const markdownEntries = entries.filter((entry) => isMarkdownBlob(entry) && isEntryInFolder(entry.path, folderPath))

        return this.gitData.readBlobFiles(project, markdownEntries)
    }

    private async readRootMarkdownFiles(project: ProjectReference, path: string): Promise<MarkdownFile[]> {
        const folderPath = normalizeFolderPath(path)
        const entries = await this.gitData.getProjectRecursiveTreeEntries(project)
        const folderExists = folderPath.length === 0 || entries.some((entry) => isEntryInFolder(entry.path, folderPath))
        if (!folderExists) throw new MissingWorkingFolderError(path)

        const markdownEntries = entries.filter((entry) => isMarkdownBlob(entry) && isDirectFileInFolder(entry.path, folderPath))

        return this.gitData.readBlobFiles(project, markdownEntries)
    }
}
