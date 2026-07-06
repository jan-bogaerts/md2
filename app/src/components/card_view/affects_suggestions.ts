const SUGGESTION_LIMIT = 50

export function filterAffectsSuggestions(repositoryFiles: string[], affects: string[], cardPath: string, input: string) {
    const normalizedInput = input.trim().toLowerCase()
    const existingPaths = new Set(affects)

    return repositoryFiles
        .filter((path) => path !== cardPath)
        .filter((path) => !existingPaths.has(path))
        .filter((path) => normalizedInput.length === 0 || path.toLowerCase().includes(normalizedInput))
        .slice(0, SUGGESTION_LIMIT)
}
