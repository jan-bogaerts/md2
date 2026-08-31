import { normalizePath } from '../../../shared/path_utils.mjs'

function trimTrailingSlashes(folderPath: string) {
    return folderPath.replace(/\/+$/u, '')
}

/**
 * Converts an absolute folder path picked in the OS dialog into the repository-relative form the
 * project config stores. Returns null when the pick lies outside the repository root, which is a
 * user mistake rather than an application failure.
 */
export function toRepositoryRelativePath(rootPath: string, absolutePath: string): string | null {
    const normalizedRoot = trimTrailingSlashes(normalizePath(rootPath))
    const normalizedPath = trimTrailingSlashes(normalizePath(absolutePath))
    if (normalizedRoot.length === 0) return null
    if (normalizedPath.toLowerCase() === normalizedRoot.toLowerCase()) return ''
    if (!normalizedPath.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) return null

    return normalizedPath.slice(normalizedRoot.length + 1)
}

/** Strips the project folder prefix, so a picked path can fill a sub-folder field. */
export function toProjectFolderRelativePath(projectFolder: string, repositoryRelativePath: string): string | null {
    const normalizedProjectFolder = trimTrailingSlashes(normalizePath(projectFolder))
    if (normalizedProjectFolder.length === 0) return repositoryRelativePath
    if (repositoryRelativePath.toLowerCase() === normalizedProjectFolder.toLowerCase()) return ''
    if (!repositoryRelativePath.toLowerCase().startsWith(`${normalizedProjectFolder.toLowerCase()}/`)) return null

    return repositoryRelativePath.slice(normalizedProjectFolder.length + 1)
}
