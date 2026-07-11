import { getNextCardNumber, slugifyTitle } from '../data/card_naming'
import type { CardTypeConfig, MarkdownFile, MoveFile } from '../data/data_types'
import { markdownParsingService, type HeaderValue, type MarkdownHeaderFields } from './markdown_parsing_service'

const DEFAULT_CARD_TYPE = 'feature'
const MARKDOWN_EXTENSION = '.md'
const TITLE_HEADING_PATTERN = /^#\s+(.+)$/mu

export interface ExternalCardImportPlan {
    importedFiles: MarkdownFile[]
    moves: MoveFile[]
}

function getFeatureCardType(cardTypes: CardTypeConfig[]) {
    const cardType = cardTypes.find((candidate) => candidate.type === DEFAULT_CARD_TYPE)
    if (!cardType) throw new Error(`Missing card type config: ${DEFAULT_CARD_TYPE}`)

    return cardType
}

function getFileName(path: string) {
    return path.split('/').at(-1) ?? path
}

function titleFromFileName(path: string) {
    const fileName = getFileName(path)
    const withoutExtension = fileName.toLowerCase().endsWith(MARKDOWN_EXTENSION) ? fileName.slice(0, -MARKDOWN_EXTENSION.length) : fileName
    const normalizedTitle = withoutExtension.replace(/[-_]+/gu, ' ').replace(/\s+/gu, ' ').trim()

    return normalizedTitle.length > 0 ? normalizedTitle : 'Untitled'
}

function titleFromBody(body: string) {
    const match = body.match(TITLE_HEADING_PATTERN)

    return match?.[1].trim() ?? null
}

function stringField(fields: MarkdownHeaderFields, key: string) {
    const value: HeaderValue | undefined = fields[key]

    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function importTitle(file: MarkdownFile, fields: MarkdownHeaderFields, body: string) {
    return stringField(fields, 'title') ?? titleFromBody(body) ?? titleFromFileName(file.path)
}

function isExternalImportCandidate(file: MarkdownFile, workingFolder: string) {
    if (!markdownParsingService.isRootWorkingFolderFile(file.path, workingFolder)) return false
    if (!markdownParsingService.isMarkdownFile(file.path)) return false

    return !markdownParsingService.followsCardNamingConvention(file.path)
}

function buildImportedContent(
    file: MarkdownFile,
    id: string,
    initialState: string,
    title: string,
    parsed: ReturnType<typeof markdownParsingService.parse>,
) {
    const internalId = stringField(parsed.header, 'internalId') ?? markdownParsingService.generateInternalId()
    const status = stringField(parsed.header, 'status') ?? initialState

    return markdownParsingService.rewriteHeader(file.content, { id, internalId, status, title })
}

function importedPath(workingFolder: string, id: string, title: string) {
    return `${workingFolder}/${id}-${slugifyTitle(title)}${MARKDOWN_EXTENSION}`
}

export function planExternalCardImports(
    files: MarkdownFile[],
    workingFolder: string,
    cardTypes: CardTypeConfig[],
    initialState: string,
): ExternalCardImportPlan {
    const cardType = getFeatureCardType(cardTypes)
    const candidates = files.filter((file) => isExternalImportCandidate(file, workingFolder))
    let nextNumber = getNextCardNumber(files, cardType.idPrefix)
    const moves: MoveFile[] = []
    const importedFiles: MarkdownFile[] = []

    for (const file of candidates) {
        const parsed = markdownParsingService.parse(file.content)
        const title = importTitle(file, parsed.header, parsed.body)
        const id = `${cardType.idPrefix}-${nextNumber}`
        const path = importedPath(workingFolder, id, title)
        const content = buildImportedContent(file, id, initialState, title, parsed)
        const importedFile = { content, path }
        moves.push({ content, fromPath: file.path, sha: file.sha, toPath: path })
        importedFiles.push(importedFile)
        nextNumber += 1
    }

    return { importedFiles, moves }
}
