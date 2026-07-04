import type { CardHeader, MarkdownFile, ProjectCard } from '../data/data_types'

const HEADER_DELIMITER = '---'
const MARKDOWN_EXTENSION = '.md'
const DEFAULT_IMPORTED_STATUS = 'new'
const DEFAULT_IMPORTED_ID = 'F-0'
const TITLE_PREFIX = '# '
const LIST_ITEM_PREFIX = '  - '
const CHILD_INDENT = '  '

export type HeaderValue = string | string[] | Record<string, string>
export type MarkdownHeaderFields = Record<string, HeaderValue>

export interface ParsedMarkdown {
    body: string
    header: MarkdownHeaderFields
    rawHeader: string
}

export interface NewCardHeader {
    affects?: string[]
    author?: string | null
    id: string
    internalId?: string | null
    owner?: string | null
    status?: string | null
    title: string
}

interface HeaderSplit {
    body: string
    hasHeader: boolean
    rawHeader: string
}

function splitHeader(content: string): HeaderSplit {
    if (!content.startsWith(`${HEADER_DELIMITER}\n`) && !content.startsWith(`${HEADER_DELIMITER}\r\n`)) {
        return { body: content, hasHeader: false, rawHeader: '' }
    }

    const normalizedContent = content.replace(/\r\n/g, '\n')
    const closingDelimiterIndex = normalizedContent.indexOf(`\n${HEADER_DELIMITER}\n`, HEADER_DELIMITER.length + 1)

    if (closingDelimiterIndex === -1) return { body: content, hasHeader: false, rawHeader: '' }

    const rawHeader = normalizedContent.slice(HEADER_DELIMITER.length + 1, closingDelimiterIndex)
    const body = normalizedContent.slice(closingDelimiterIndex + HEADER_DELIMITER.length + 2)

    return { body, hasHeader: true, rawHeader }
}

function parseListValue(lines: string[], startIndex: number) {
    const values: string[] = []
    let index = startIndex + 1

    while (index < lines.length && lines[index].startsWith(LIST_ITEM_PREFIX)) {
        values.push(lines[index].slice(LIST_ITEM_PREFIX.length).trim())
        index += 1
    }

    return { nextIndex: index, values }
}

function parseMapValue(lines: string[], startIndex: number) {
    const value: Record<string, string> = {}
    let index = startIndex + 1

    while (index < lines.length && lines[index].startsWith(CHILD_INDENT) && !lines[index].startsWith(LIST_ITEM_PREFIX)) {
        const childLine = lines[index].trim()
        const separatorIndex = childLine.indexOf(':')

        if (separatorIndex === -1) break

        value[childLine.slice(0, separatorIndex).trim()] = childLine.slice(separatorIndex + 1).trim()
        index += 1
    }

    return { nextIndex: index, value }
}

function parseHeaderFields(headerText: string): MarkdownHeaderFields {
    const fields: MarkdownHeaderFields = {}
    const lines = headerText.split(/\r?\n/)
    let index = 0

    while (index < lines.length) {
        const line = lines[index]
        const separatorIndex = line.indexOf(':')

        if (separatorIndex === -1 || line.startsWith(' ')) {
            index += 1
            continue
        }

        const key = line.slice(0, separatorIndex).trim()
        const value = line.slice(separatorIndex + 1).trim()

        if (value.length > 0) {
            fields[key] = value
            index += 1
            continue
        }

        const nextLine = lines[index + 1] ?? ''

        if (nextLine.startsWith(LIST_ITEM_PREFIX)) {
            const listValue = parseListValue(lines, index)
            fields[key] = listValue.values
            index = listValue.nextIndex
            continue
        }

        if (nextLine.startsWith(CHILD_INDENT)) {
            const mapValue = parseMapValue(lines, index)
            fields[key] = mapValue.value
            index = mapValue.nextIndex
            continue
        }

        fields[key] = ''
        index += 1
    }

    return fields
}

function getStringField(fields: MarkdownHeaderFields, fieldName: string) {
    const value = fields[fieldName]

    return typeof value === 'string' && value.length > 0 ? value : null
}

function getListField(fields: MarkdownHeaderFields, fieldName: string) {
    const value = fields[fieldName]

    return Array.isArray(value) ? value : []
}

function getTitleFromBody(body: string) {
    const titleLine = body.split(/\r?\n/).find((line) => line.startsWith(TITLE_PREFIX))

    return titleLine ? titleLine.slice(TITLE_PREFIX.length).trim() : 'Untitled'
}

function getFileName(path: string) {
    return path.split('/').at(-1) ?? path
}

function isMarkdownFile(path: string) {
    return path.toLowerCase().endsWith(MARKDOWN_EXTENSION)
}

function isRootWorkingFolderFile(path: string, workingFolder: string) {
    const normalizedPath = path.replace(/\\/g, '/')
    const prefix = `${workingFolder}/`
    const remainingPath = normalizedPath.startsWith(prefix) ? normalizedPath.slice(prefix.length) : normalizedPath

    return !remainingPath.includes('/') && isMarkdownFile(remainingPath)
}

function followsCardNamingConvention(path: string) {
    return /^[A-Z]+-\d+-.+\.md$/u.test(getFileName(path))
}

function parseCardHeader(fields: MarkdownHeaderFields, file: MarkdownFile, body: string): CardHeader {
    const fileName = getFileName(file.path)
    const fileId = fileName.match(/^([A-Z]+-\d+)-/u)?.[1] ?? null
    const id = getStringField(fields, 'id') ?? fileId ?? DEFAULT_IMPORTED_ID
    const title = getStringField(fields, 'title') ?? getTitleFromBody(body)
    const status = getStringField(fields, 'status') ?? (followsCardNamingConvention(file.path) ? null : DEFAULT_IMPORTED_STATUS)

    return {
        affects: getListField(fields, 'affects'),
        id,
        internalId: getStringField(fields, 'internalId'),
        owner: getStringField(fields, 'owner'),
        status,
        title,
    }
}

function rewriteHeaderLine(lines: string[], key: string, value: string) {
    const keyPrefix = `${key}:`
    const targetIndex = lines.findIndex((line) => !line.startsWith(' ') && line.slice(0, line.indexOf(':') + 1) === keyPrefix)

    if (targetIndex === -1) return [...lines, `${key}: ${value}`]

    const updated = [...lines]
    updated[targetIndex] = `${key}: ${value}`

    return updated
}

function serializeNewHeader(header: NewCardHeader) {
    if (!header.id) throw new Error('Cannot generate a card without an id')
    if (!header.title) throw new Error('Cannot generate a card without a title')

    const lines: string[] = []

    if (header.author != null) lines.push(`author: ${header.author}`)
    lines.push(`id: ${header.id}`)
    if (header.internalId != null) lines.push(`internalId: ${header.internalId}`)
    lines.push(`title: ${header.title}`)
    lines.push(`status: ${header.status ?? DEFAULT_IMPORTED_STATUS}`)
    if (header.owner != null) lines.push(`owner: ${header.owner}`)

    const affects = header.affects ?? []
    lines.push('affects:', ...affects.map((entry) => `${LIST_ITEM_PREFIX}${entry}`))

    return lines.join('\n')
}

export const markdownParsingService = {
    followsCardNamingConvention,

    isMarkdownFile,

    isRootWorkingFolderFile,

    parse(content: string): ParsedMarkdown {
        const { body, rawHeader } = splitHeader(content)

        return { body, header: parseHeaderFields(rawHeader), rawHeader }
    },

    parseCard(file: MarkdownFile, workingFolder: string): ProjectCard {
        const { body, rawHeader } = splitHeader(file.content)
        const fields = parseHeaderFields(rawHeader)

        return {
            content: body,
            header: parseCardHeader(fields, file, body),
            isActive: isRootWorkingFolderFile(file.path, workingFolder),
            path: file.path,
            sha: file.sha,
        }
    },

    splitCards(files: MarkdownFile[], workingFolder: string) {
        const markdownFiles = files.filter((file) => isMarkdownFile(file.path))
        const activeCards = markdownFiles
            .filter((file) => isRootWorkingFolderFile(file.path, workingFolder))
            .map((file) => this.parseCard(file, workingFolder))
        const backgroundCards = markdownFiles
            .filter((file) => !isRootWorkingFolderFile(file.path, workingFolder))
            .map((file) => this.parseCard(file, workingFolder))

        return { activeCards, backgroundCards }
    },

    replaceBody(content: string, body: string) {
        const { hasHeader, rawHeader } = splitHeader(content)

        if (!hasHeader) return body

        return `${HEADER_DELIMITER}\n${rawHeader}\n${HEADER_DELIMITER}\n${body}`
    },

    rewriteHeader(content: string, updates: Record<string, string>) {
        const { body, hasHeader, rawHeader } = splitHeader(content)
        const startingLines = hasHeader ? rawHeader.split('\n') : []
        const nextLines = Object.entries(updates).reduce(
            (lines, [key, value]) => rewriteHeaderLine(lines, key, value),
            startingLines,
        )
        const nextHeader = nextLines.join('\n')

        if (hasHeader) return `${HEADER_DELIMITER}\n${nextHeader}\n${HEADER_DELIMITER}\n${body}`

        return `${HEADER_DELIMITER}\n${nextHeader}\n${HEADER_DELIMITER}\n\n${content}`
    },

    buildCardMarkdown(header: NewCardHeader, body: string) {
        return `${HEADER_DELIMITER}\n${serializeNewHeader(header)}\n${HEADER_DELIMITER}\n\n# ${header.title}\n\n${body}`
    },

    generateInternalId() {
        return crypto.randomUUID()
    },
}
