import type { CommitRequest, DeleteFileRequest, DeleteFolderRequest, MarkdownFile, MoveFilesRequest, ProjectReference } from '../../data/data_types'
import { mapWithConcurrency } from '../concurrency'
import {
    deleteStoredPendingCommitHead,
    GithubPendingCommitConflictError,
    readStoredPendingCommitHead,
    type GithubStorageContext,
} from './github_storage_context'
import type { GithubStorageGitData } from './github_storage_git_data'
import type { GithubBranchHead, GithubTreeChange, GithubTreeFile } from './github_storage_types'
import { createPendingHeadKey, encodeGithubPath, GITHUB_STORAGE_CONCURRENCY, PROJECT_README_TEMPLATE } from './github_storage_types'
import { normalizeGitRef } from './github_storage_normalizers'

export class GithubStorageWriter {
    private readonly context: GithubStorageContext
    private readonly gitData: GithubStorageGitData

    constructor(context: GithubStorageContext, gitData: GithubStorageGitData) {
        this.context = context
        this.gitData = gitData
    }

    async createProject(project: ProjectReference, workingFolder: string) {
        this.context.requireGithubProject(project)
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

    async checkoutBranch(project: ProjectReference, branch: string) {
        const accessToken = this.context.getAccessToken()
        if (accessToken.length === 0) throw new Error('Missing GitHub access token')

        this.context.requireGithubProject({ ...project, branch })

        return { ...project, branch }
    }

    async commit(request: CommitRequest) {
        const branchHead = await this.gitData.getBranchHead(request.branch)
        await this.gitData.assertFileShasMatch(branchHead.treeSha, request.files)

        const updatedFiles: MarkdownFile[] = []
        const treeChanges: GithubTreeChange[] = []
        const blobs = await mapWithConcurrency(request.files, GITHUB_STORAGE_CONCURRENCY, async (file) => this.gitData.createBlob(file))

        for (const [index, file] of request.files.entries()) {
            const blob = blobs[index]
            updatedFiles.push({ ...file, sha: blob.sha })
            treeChanges.push({ path: file.path, sha: blob.sha })
        }

        const moves = request.moves ?? []
        const sourceEntries = moves.length > 0
            ? await this.gitData.getRecursiveTreeEntries(branchHead.treeSha)
            : null
        const moveBlobs = await mapWithConcurrency(moves, GITHUB_STORAGE_CONCURRENCY, async (move) => this.gitData.createBlob({
            content: move.content,
            encoding: move.encoding,
            path: move.toPath,
        }))
        for (const [index, move] of moves.entries()) {
            const blob = moveBlobs[index]
            updatedFiles.push({
                content: move.content,
                ...(move.encoding ? { encoding: move.encoding } : {}),
                path: move.toPath,
                sha: blob.sha,
            })
            treeChanges.push({ path: move.toPath, sha: blob.sha })
            if (sourceEntries?.has(move.fromPath)) treeChanges.push({ path: move.fromPath, sha: null })
        }

        await this.createPendingCommit(request.branch, request.message, branchHead, treeChanges)

        return updatedFiles
    }

    async deleteFile(request: DeleteFileRequest) {
        const branchHead = await this.gitData.getBranchHead(request.branch)
        if (request.sha) {
            await this.gitData.assertPathShasMatch(branchHead.treeSha, [{ path: request.path, sha: request.sha }])
        } else {
            const entries = await this.gitData.getRecursiveTreeEntries(branchHead.treeSha)
            if (!entries.has(request.path)) throw new Error(`Cannot delete missing GitHub file: ${request.path}`)
        }
        await this.createPendingCommit(request.branch, request.message, branchHead, [{ path: request.path, sha: null }])
    }

    async deleteFolder(request: DeleteFolderRequest) {
        const branchHead = await this.gitData.getBranchHead(request.branch)
        const folderPrefix = `${request.path.replace(/\/+$/u, '')}/`
        const entries = await this.gitData.getRecursiveTreeEntries(branchHead.treeSha)
        const treeChanges: GithubTreeChange[] = [...entries.keys()]
            .filter((path) => path.startsWith(folderPrefix))
            .map((path) => ({ path, sha: null }))
        if (treeChanges.length === 0) throw new Error(`Cannot delete missing or empty folder: ${request.path}`)

        await this.createPendingCommit(request.branch, request.message, branchHead, treeChanges)
    }

    async moveFiles(request: MoveFilesRequest) {
        const branchHead = await this.gitData.getBranchHead(request.branch)
        const entries = await this.gitData.getRecursiveTreeEntries(branchHead.treeSha)
        const sourceFiles: GithubTreeFile[] = []
        for (const move of request.moves) {
            if (!entries.has(move.fromPath)) continue
            if (!move.sha) throw new Error(`Cannot delete GitHub file without sha: ${move.fromPath}`)
            sourceFiles.push({ path: move.fromPath, sha: move.sha })
        }

        await this.gitData.assertPathShasMatch(branchHead.treeSha, sourceFiles)

        const treeChanges: GithubTreeChange[] = []
        const blobs = await mapWithConcurrency(request.moves, GITHUB_STORAGE_CONCURRENCY, async (move) => this.gitData.createBlob({
            content: move.content,
            encoding: move.encoding,
            path: move.toPath,
        }))

        for (const [index, move] of request.moves.entries()) {
            const blob = blobs[index]
            treeChanges.push({ path: move.toPath, sha: blob.sha })
            if (entries.has(move.fromPath)) treeChanges.push({ path: move.fromPath, sha: null })
        }

        await this.createPendingCommit(request.branch, request.message, branchHead, treeChanges)
    }

    async push(project: ProjectReference) {
        const accessToken = this.context.getAccessToken()
        if (accessToken.length === 0) throw new Error('Missing GitHub access token')

        this.context.requireGithubProject(project)
        const pendingHeadKey = createPendingHeadKey(project)
        const pendingCommitHead = this.context.pendingCommitHeads.get(pendingHeadKey)
        if (!pendingCommitHead) return Promise.resolve()

        await this.gitData.updateBranchRef(project.branch, pendingCommitHead.headSha)
        this.context.pendingCommitHeads.delete(pendingHeadKey)
        this.context.writePendingCommitHeads()

        return Promise.resolve()
    }

    async restorePendingCommits(project: ProjectReference) {
        this.context.requireGithubProject(project)
        const pendingHeadKey = createPendingHeadKey(project)
        const storedPendingHead = readStoredPendingCommitHead(project)
        if (!storedPendingHead) return

        const gitRef = normalizeGitRef(await this.context.getApiClient().requestJson(
            `/repos/${project.owner}/${project.repository}/git/ref/heads/${encodeGithubPath(project.branch)}`,
        ))
        if (gitRef.commitSha !== storedPendingHead.baseSha) throw new GithubPendingCommitConflictError(project)

        const pendingCommit = await this.gitData.getOptionalCommit(storedPendingHead.headSha)
        if (!pendingCommit) throw new GithubPendingCommitConflictError(project)

        this.context.pendingCommitHeads.set(pendingHeadKey, storedPendingHead)
    }

    hasPendingPush(project: ProjectReference) {
        return this.context.pendingCommitHeads.has(createPendingHeadKey(project))
    }

    discardPendingCommits(project: ProjectReference) {
        const pendingHeadKey = createPendingHeadKey(project)
        this.context.pendingCommitHeads.delete(pendingHeadKey)
        deleteStoredPendingCommitHead(project)
    }

    private async createPendingCommit(branch: string, message: string, branchHead: GithubBranchHead, treeChanges: GithubTreeChange[]) {
        const tree = await this.gitData.createTree(branchHead.treeSha, treeChanges)
        const commit = await this.gitData.createCommit(message, tree.sha, branchHead.commitSha)
        const project = this.context.getCommitProject()
        const pendingHeadKey = createPendingHeadKey({ ...project, branch })
        const existingPendingHead = this.context.pendingCommitHeads.get(pendingHeadKey)
        this.context.pendingCommitHeads.set(pendingHeadKey, {
            baseSha: existingPendingHead?.baseSha ?? branchHead.commitSha,
            headSha: commit.sha,
        })
        this.context.writePendingCommitHeads()
    }
}
