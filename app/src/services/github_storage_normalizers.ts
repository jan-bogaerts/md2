import type { BranchReference, MarkdownFile, RepositoryReference } from '../data/data_types'
import type { NormalizedGithubTreeEntry } from './github_storage_types'
import { requireString } from './github_storage_types'

const TEXT_DECODER = new TextDecoder()

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
    encoding?: unknown
    path?: unknown
    sha?: unknown
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

interface GithubTreeEntry {
    path?: unknown
    sha?: unknown
    type?: unknown
}

function decodeContent(content: string) {
    const binary = Uint8Array.from(atob(content.replace(/\s/gu, '')), (character) => character.charCodeAt(0))

    return TEXT_DECODER.decode(binary)
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

export function normalizeRepository(payload: unknown): RepositoryReference {
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

export function normalizeRepositories(payload: unknown): RepositoryReference[] {
    if (!Array.isArray(payload)) throw new Error('Missing GitHub storage field: repositories')

    return payload.map((repository) => normalizeRepository(repository))
}

export function normalizeBranches(payload: unknown): BranchReference[] {
    if (!Array.isArray(payload)) throw new Error('Missing GitHub storage field: branches')

    return payload.map((branch) => ({ name: requireString((branch as GithubBranchResponse).name, 'branch.name') }))
}

export function normalizeFileContent(payload: unknown): MarkdownFile {
    const response = payload as GithubContentResponse
    const encoding = requireString(response.encoding, 'content.encoding')

    if (encoding !== 'base64') throw new Error(`Unsupported GitHub content encoding: ${encoding}`)

    return {
        content: decodeContent(requireString(response.content, 'content.content')),
        path: requireString(response.path, 'content.path'),
        sha: requireString(response.sha, 'content.sha'),
    }
}

export function normalizeProjectAsset(payload: unknown) {
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

export function normalizeGitRef(payload: unknown) {
    const response = payload as GithubGitRefResponse
    const objectType = requireString(response.object?.type, 'gitRef.object.type')
    if (objectType !== 'commit') throw new Error(`Unsupported GitHub ref object type: ${objectType}`)

    return {
        commitSha: requireString(response.object?.sha, 'gitRef.object.sha'),
        ref: requireString(response.ref, 'gitRef.ref'),
    }
}

export function normalizeGitBlob(payload: unknown) {
    const response = payload as GithubGitBlobResponse

    return { sha: requireString(response.sha, 'gitBlob.sha') }
}

export function normalizeGitTree(payload: unknown) {
    const response = payload as GithubGitTreeResponse

    return { sha: requireString(response.sha, 'gitTree.sha') }
}

export function normalizeRecursiveGitTree(payload: unknown) {
    const entries = normalizeRecursiveGitTreeEntries(payload)
    const blobs = new Map<string, string>()

    for (const entry of entries) {
        if (entry.type === 'blob') blobs.set(entry.path, entry.sha)
    }

    return blobs
}

export function normalizeRecursiveGitTreeEntries(payload: unknown) {
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

export function normalizeGitCommit(payload: unknown) {
    const response = payload as GithubGitCommitResponse

    return {
        sha: requireString(response.sha, 'gitCommit.sha'),
        treeSha: requireString(response.tree?.sha, 'gitCommit.tree.sha'),
    }
}
