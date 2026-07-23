import { markdownParsingService } from '../services/data/markdown_parsing_service'
import type { CardDraft, CardTypeConfig, MarkdownFile } from './data_types'
import { buildCardId, type CardSeparator } from './card_identifiers'

const MARKDOWN_EXTENSION = '.md'
const DEFAULT_TITLE_SLUG = 'untitled'

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

export function slugifyTitle(title: string, cardSeparator: CardSeparator) {
    const slug = title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, cardSeparator)
        .replace(new RegExp(`^[${escapeRegExp(cardSeparator)}]|[${escapeRegExp(cardSeparator)}]$`, 'gu'), '')

    return slug.length > 0 ? slug : DEFAULT_TITLE_SLUG
}

/** Card file names keep their id and the separator style they were created with. */
const CARD_FILE_NAME_PATTERN = /^([A-Za-z][A-Za-z0-9]*)([-_])(\d+)\2(.+)\.md$/u

function splitPath(path: string) {
    const separatorIndex = path.lastIndexOf('/')

    return separatorIndex === -1
        ? { directory: '', fileName: path }
        : { directory: path.slice(0, separatorIndex), fileName: path.slice(separatorIndex + 1) }
}

/**
 * Resolves the file path a card should live at for `title`, keeping its id, folder and separator style.
 * Returns `currentPath` when the name cannot be parsed as a card file or the target is already taken.
 */
export function desiredCardPath(currentPath: string, title: string, occupiedPaths: Iterable<string>) {
    const normalizedPath = currentPath.replace(/\\/gu, '/')
    const { directory, fileName } = splitPath(normalizedPath)
    const match = fileName.match(CARD_FILE_NAME_PATTERN)
    if (!match) return currentPath

    const [, idPrefix, separator, number] = match
    const cardSeparator = separator as CardSeparator
    const titleSlug = slugifyTitle(title, cardSeparator)
    const nextFileName = `${idPrefix}${separator}${number}${separator}${titleSlug}${MARKDOWN_EXTENSION}`
    const desiredPath = directory.length > 0 ? `${directory}/${nextFileName}` : nextFileName
    if (desiredPath === normalizedPath) return currentPath

    const sourcePathKey = normalizedPath.toLowerCase()
    const taken = [...occupiedPaths]
        .map((path) => path.replace(/\\/gu, '/').toLowerCase())
        .some((path) => path !== sourcePathKey && path === desiredPath.toLowerCase())

    return taken ? currentPath : desiredPath
}

function getCardTypeConfig(cardTypes: CardTypeConfig[], draft: CardDraft) {
    const cardTypeConfig = cardTypes.find((config) => config.type === draft.type)

    if (!cardTypeConfig) throw new Error(`Missing card type config: ${draft.type}`)

    return cardTypeConfig
}

export function getNextCardNumber(files: MarkdownFile[], idPrefix: string) {
    const idPattern = new RegExp(`(?:^|/)${escapeRegExp(idPrefix)}[-_](\\d+)[-_].+\\.md$`, 'u')
    const numbers = files
        .map((file) => file.path.match(idPattern)?.[1])
        .filter((number): number is string => !!number)
        .map((number) => Number.parseInt(number, 10))

    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1
}

function buildCardBody(template: string, draft: CardDraft) {
    if (draft.bodyIncludesTemplate) return draft.body

    const hasDraftBody = draft.body.trim().length > 0

    return hasDraftBody ? `${template}\n\n${draft.body}` : template
}

export function createCardFile(
    files: MarkdownFile[],
    workingFolder: string,
    cardSeparator: CardSeparator,
    cardTypes: CardTypeConfig[],
    cardBodyTemplate: string,
    initialState: string,
    draft: CardDraft,
): MarkdownFile {
    const cardTypeConfig = getCardTypeConfig(cardTypes, draft)
    const number = getNextCardNumber(files, cardTypeConfig.idPrefix)
    const id = buildCardId(cardTypeConfig.idPrefix, number, cardSeparator)
    const titleSlug = slugifyTitle(draft.title, cardSeparator)
    const internalId = markdownParsingService.generateInternalId()
    const content = markdownParsingService.buildCardMarkdown(
        { affects: [], id, internalId, policy: {}, status: initialState, title: draft.title },
        buildCardBody(cardBodyTemplate, draft),
    )

    return {
        content,
        path: `${workingFolder}/${id}${cardSeparator}${titleSlug}${MARKDOWN_EXTENSION}`,
    }
}
