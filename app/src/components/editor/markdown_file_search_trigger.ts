import type { TriggerFn } from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { repositoryFileMatchesQuery } from './markdown_file_search'

const FILE_SEARCH_TRIGGER_PATTERN = /(^|[\s(])@([^\s@]*)$/u

function parseFileSearchTrigger(text: string) {
    const match = FILE_SEARCH_TRIGGER_PATTERN.exec(text)
    if (!match) return null

    const boundary = match[1]
    const query = match[2]

    return {
        leadOffset: match.index + boundary.length,
        matchingString: query,
        replaceableString: `@${query}`,
    }
}

export const matchFileSearchTrigger: TriggerFn = (text) => parseFileSearchTrigger(text)

/** Match file-search trigger only when current query has repository results. */
export function matchFileSearchTriggerForFiles(text: string, repositoryFiles: readonly string[]) {
    const match = parseFileSearchTrigger(text)
    if (!match || !repositoryFiles.some((repositoryPath) => (
        repositoryFileMatchesQuery(repositoryPath, match.matchingString)
    ))) return null

    return match
}
