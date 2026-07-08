import type { ProjectReference } from '../data/data_types'

export const GITHUB_PAGE_SIZE = 100
export const GITHUB_STORAGE_CONCURRENCY = 8
export const PROJECT_CONFIG_PATH = 'md2.config.json'
export const PROJECT_README_TEMPLATE = '# MD2\n\nProject design folder created by MD2.\n'

export interface GithubStorageDependencies {
    accessToken: string
    fetchImplementation?: typeof fetch
    onUnauthorized?: () => void
}

export interface GithubTreeFile {
    path: string
    sha: string
}

export interface GithubTreeDelete {
    path: string
    sha: null
}

export interface NormalizedGithubTreeEntry {
    path: string
    sha: string
    type: string
}

export interface GithubBranchHead {
    commitSha: string
    treeSha: string
}

export interface PendingCommitHead {
    baseSha: string
    headSha: string
}

export type GithubTreeChange = GithubTreeDelete | GithubTreeFile

export function requireString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing GitHub storage field: ${fieldName}`)

    return value
}

export function encodeGithubPath(path: string) {
    return path.split('/').map(encodeURIComponent).join('/')
}

export function createPendingHeadKey(project: ProjectReference) {
    if (!project.owner) throw new Error('Missing GitHub project owner')
    if (!project.repository) throw new Error('Missing GitHub project repository')

    return `${project.owner}/${project.repository}:${project.branch}`
}
