import { repositoryFileMatchesQuery } from './markdown_file_search'
import { MarkdownFileSearchOption } from './markdown_file_search_option'

/** Build file-search options only while a typeahead query is active. */
export function createFileSearchOptions(repositoryFiles: readonly string[], query: string | null) {
    if (query === null) return []

    return repositoryFiles
        .filter((repositoryPath) => repositoryFileMatchesQuery(repositoryPath, query))
        .map((repositoryPath) => new MarkdownFileSearchOption(repositoryPath))
}
