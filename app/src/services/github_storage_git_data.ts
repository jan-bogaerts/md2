import type { MarkdownFile, ProjectReference } from '../data/data_types'
import { mapWithConcurrency } from './concurrency'
import {
    normalizeFileContent,
    normalizeGitBlob,
    normalizeGitCommit,
    normalizeGitRef,
    normalizeGitTree,
    normalizeRecursiveGitTree,
    normalizeRecursiveGitTreeEntries,
} from './github_storage_normalizers'
import type {
    GithubBranchHead,
    GithubTreeChange,
    GithubTreeFile,
    NormalizedGithubTreeEntry,
} from './github_storage_types'
import { createPendingHeadKey, encodeGithubPath, GITHUB_STORAGE_CONCURRENCY } from './github_storage_types'
import type { GithubStorageContext } from './github_storage_context'

export class GithubStorageGitData {
    private readonly context: GithubStorageContext

    constructor(context: GithubStorageContext) {
        this.context = context
    }

    async readFile(project: ProjectReference, path: string) {
        const payload = await this.context.getApiClient().requestJson(
            `/repos/${project.owner}/${project.repository}/contents/${encodeGithubPath(path)}?ref=${encodeURIComponent(project.branch)}`,
        )

        return normalizeFileContent(payload)
    }

    async readOptionalFile(project: ProjectReference, path: string) {
        const payload = await this.context.getApiClient().requestJson(
            `/repos/${project.owner}/${project.repository}/contents/${encodeGithubPath(path)}?ref=${encodeURIComponent(project.branch)}`,
            {},
            true,
        )
        if (payload === null) return null

        return normalizeFileContent(payload)
    }

    async readBlobFiles(project: ProjectReference, entries: NormalizedGithubTreeEntry[]): Promise<MarkdownFile[]> {
        return mapWithConcurrency(entries, GITHUB_STORAGE_CONCURRENCY, async (entry) => this.readBlobFile(project, entry))
    }

    async readBlobFile(project: ProjectReference, entry: NormalizedGithubTreeEntry): Promise<MarkdownFile> {
        const requestInit = { headers: { Accept: 'application/vnd.github.raw' } }
        const content = await this.context.getApiClient().requestText(
            `/repos/${project.owner}/${project.repository}/git/blobs/${entry.sha}`,
            requestInit,
        )

        return { content, path: entry.path, sha: entry.sha }
    }

    async getBranchHead(branch: string): Promise<GithubBranchHead> {
        const project = this.context.getCommitProject()
        const pendingCommitHead = this.context.pendingCommitHeads.get(createPendingHeadKey({ ...project, branch }))
        if (pendingCommitHead) {
            const pendingCommit = await this.getCommit(pendingCommitHead.headSha)

            return { commitSha: pendingCommit.sha, treeSha: pendingCommit.treeSha }
        }

        const gitRef = normalizeGitRef(await this.context.getApiClient().requestJson(
            `/repos/${project.owner}/${project.repository}/git/ref/heads/${encodeGithubPath(branch)}`,
        ))
        const gitCommit = await this.getCommit(gitRef.commitSha)

        return { commitSha: gitRef.commitSha, treeSha: gitCommit.treeSha }
    }

    async getProjectRecursiveTreeEntries(project: ProjectReference) {
        const { treeSha } = await this.getBranchHead(project.branch)
        const cacheKey = `${createPendingHeadKey(project)}:${treeSha}`
        const cachedEntries = this.context.projectTreeEntriesByHead.get(cacheKey)
        if (cachedEntries) return cachedEntries

        const response = await this.context.getApiClient().requestJson(
            `/repos/${project.owner}/${project.repository}/git/trees/${treeSha}?recursive=1`,
        )
        const entries = normalizeRecursiveGitTreeEntries(response)
        this.context.projectTreeEntriesByHead.set(cacheKey, entries)

        return entries
    }

    async assertFileShasMatch(treeSha: string, files: MarkdownFile[]) {
        const filesWithSha: GithubTreeFile[] = []
        for (const file of files) {
            if (file.sha) filesWithSha.push({ path: file.path, sha: file.sha })
        }

        await this.assertPathShasMatch(treeSha, filesWithSha)
    }

    async assertPathShasMatch(treeSha: string, files: GithubTreeFile[]) {
        if (files.length === 0) return

        const treeEntries = await this.getRecursiveTreeEntries(treeSha)
        for (const file of files) {
            if (treeEntries.get(file.path) !== file.sha) {
                throw new Error('The file changed remotely. Reload or refresh the project before saving again.')
            }
        }
    }

    async createBlob(file: MarkdownFile) {
        const project = this.context.getCommitProject()
        const payload = {
            content: file.content,
            encoding: file.encoding ?? 'utf-8',
        }
        const response = await this.context.getApiClient().requestJson(`/repos/${project.owner}/${project.repository}/git/blobs`, {
            body: JSON.stringify(payload),
            method: 'POST',
        })

        return normalizeGitBlob(response)
    }

    async createTree(baseTreeSha: string, files: GithubTreeChange[]) {
        const project = this.context.getCommitProject()
        const tree = files.map((file) => ({ mode: '100644', path: file.path, sha: file.sha, type: 'blob' }))
        const payload = { base_tree: baseTreeSha, tree }
        const response = await this.context.getApiClient().requestJson(`/repos/${project.owner}/${project.repository}/git/trees`, {
            body: JSON.stringify(payload),
            method: 'POST',
        })

        return normalizeGitTree(response)
    }

    async createCommit(message: string, treeSha: string, parentSha: string) {
        const project = this.context.getCommitProject()
        const payload = { message, parents: [parentSha], tree: treeSha }
        const response = await this.context.getApiClient().requestJson(`/repos/${project.owner}/${project.repository}/git/commits`, {
            body: JSON.stringify(payload),
            method: 'POST',
        })

        return normalizeGitCommit(response)
    }

    async updateBranchRef(branch: string, commitSha: string) {
        const project = this.context.getCommitProject()
        const payload = { force: false, sha: commitSha }

        await this.context.getApiClient().requestJson(`/repos/${project.owner}/${project.repository}/git/refs/heads/${encodeGithubPath(branch)}`, {
            body: JSON.stringify(payload),
            method: 'PATCH',
        })
    }

    async getCommit(commitSha: string) {
        const project = this.context.getCommitProject()
        const response = await this.context.getApiClient().requestJson(
            `/repos/${project.owner}/${project.repository}/git/commits/${commitSha}`,
        )

        return normalizeGitCommit(response)
    }

    async getOptionalCommit(commitSha: string) {
        const project = this.context.getCommitProject()
        const response = await this.context.getApiClient().requestJson(
            `/repos/${project.owner}/${project.repository}/git/commits/${commitSha}`,
            {},
            true,
        )
        if (response === null) return null

        return normalizeGitCommit(response)
    }

    private async getRecursiveTreeEntries(treeSha: string) {
        const cachedEntries = this.context.recursiveTreeEntriesBySha.get(treeSha)
        if (cachedEntries) return cachedEntries

        const project = this.context.getCommitProject()
        const response = await this.context.getApiClient().requestJson(
            `/repos/${project.owner}/${project.repository}/git/trees/${treeSha}?recursive=1`,
        )
        const treeEntries = normalizeRecursiveGitTree(response)
        this.context.recursiveTreeEntriesBySha.set(treeSha, treeEntries)

        return treeEntries
    }
}
