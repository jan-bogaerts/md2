import { markdownParsingService } from '../services/markdown_parsing_service'
import type { CardDraft, CardTypeConfig, MarkdownFile } from './data_types'

const MARKDOWN_EXTENSION = '.md'
const TITLE_SEPARATOR = '-'
const DEFAULT_TITLE_SLUG = 'untitled'

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function slugifyTitle(title: string) {
    const slug = title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, TITLE_SEPARATOR)
        .replace(/^-|-$/gu, '')

    return slug.length > 0 ? slug : DEFAULT_TITLE_SLUG
}

function getCardTypeConfig(cardTypes: CardTypeConfig[], draft: CardDraft) {
    const cardTypeConfig = cardTypes.find((config) => config.type === draft.type)

    if (!cardTypeConfig) throw new Error(`Missing card type config: ${draft.type}`)

    return cardTypeConfig
}

export function getNextCardNumber(files: MarkdownFile[], idPrefix: string) {
    const idPattern = new RegExp(`(?:^|/)${escapeRegExp(idPrefix)}-(\\d+)-.+\\.md$`, 'u')
    const numbers = files
        .map((file) => file.path.match(idPattern)?.[1])
        .filter((number): number is string => !!number)
        .map((number) => Number.parseInt(number, 10))

    return numbers.length > 0 ? Math.max(...numbers) + 1 : 1
}

export function createCardFile(files: MarkdownFile[], workingFolder: string, cardTypes: CardTypeConfig[], draft: CardDraft): MarkdownFile {
    const cardTypeConfig = getCardTypeConfig(cardTypes, draft)
    const number = getNextCardNumber(files, cardTypeConfig.idPrefix)
    const id = `${cardTypeConfig.idPrefix}-${number}`
    const titleSlug = slugifyTitle(draft.title)

    return {
        content: markdownParsingService.buildCardMarkdown(
            { affects: [], id, internalId: markdownParsingService.generateInternalId(), status: 'new', title: draft.title },
            draft.body,
        ),
        path: `${workingFolder}/${id}-${titleSlug}${MARKDOWN_EXTENSION}`,
    }
}
