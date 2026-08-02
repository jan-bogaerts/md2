/** Return filename portion of a repository-relative path. */
export function repositoryFileName(repositoryPath: string) {
    const segments = repositoryPath.split('/')

    return segments.at(-1) ?? ''
}

/** Match a repository path against a case-insensitive file-search query. */
export function repositoryFileMatchesQuery(repositoryPath: string, query: string) {
    return repositoryPath.toLocaleLowerCase().includes(query.toLocaleLowerCase())
}
