export const RECENT_LOCAL_REPOSITORIES_STORAGE_KEY = 'md2.recentLocalRepositories'
export const MAX_RECENT_LOCAL_REPOSITORIES = 5

function isRecentRepositoryList(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((path) => typeof path === 'string' && path.length > 0)
}

/** Read canonical local repository roots, newest first. */
export function readRecentLocalRepositories() {
    const storedValue = window.localStorage.getItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)
    if (!storedValue) return []

    try {
        const parsedValue: unknown = JSON.parse(storedValue)
        if (isRecentRepositoryList(parsedValue)) return parsedValue.slice(0, MAX_RECENT_LOCAL_REPOSITORIES)
    } catch {
        // Invalid stored history is discarded below.
    }

    window.localStorage.removeItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY)

    return []
}

/** Record one successfully opened canonical root with Windows case-insensitive uniqueness. */
export function recordRecentLocalRepository(rootPath: string) {
    if (rootPath.length === 0) throw new Error('Local repository root path is required')

    const normalizedRoot = rootPath.toLowerCase()
    const recentRepositories = readRecentLocalRepositories()
        .filter((path) => path.toLowerCase() !== normalizedRoot)
    const nextRepositories = [rootPath, ...recentRepositories].slice(0, MAX_RECENT_LOCAL_REPOSITORIES)
    window.localStorage.setItem(RECENT_LOCAL_REPOSITORIES_STORAGE_KEY, JSON.stringify(nextRepositories))

    return nextRepositories
}
