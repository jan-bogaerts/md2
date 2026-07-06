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
    agentLogReferences?: string[]
    author?: string | null
    id: string
    internalId: string
    owner?: string | null
    policy?: Record<string, string>
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

function getMapField(fields: MarkdownHeaderFields, fieldName: string): Record<string, string> {
    const value = fields[fieldName]

    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
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
        after: getStringField(fields, 'after'),
        agentLogReferences: getListField(fields, 'agents'),
        author: getStringField(fields, 'author'),
        id,
        internalId: getStringField(fields, 'internalId'),
        owner: getStringField(fields, 'owner'),
        policy: getMapField(fields, 'policy'),
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

function isHeaderKeyLine(line: string, key: string) {
    return !line.startsWith(' ') && line.slice(0, line.indexOf(':') + 1) === `${key}:`
}

function rewritePolicyLines(lines: string[], key: string, value: string) {
    const childLine = `${CHILD_INDENT}${key}: ${value}`
    const policyIndex = lines.findIndex((line) => isHeaderKeyLine(line, 'policy'))

    if (policyIndex === -1) return [...lines, 'policy:', childLine]

    let childIndex = policyIndex + 1
    let lastChildIndex = policyIndex

    while (childIndex < lines.length && lines[childIndex].startsWith(CHILD_INDENT)) {
        const trimmed = lines[childIndex].trim()

        if (trimmed.slice(0, trimmed.indexOf(':')).trim() === key) {
            const updated = [...lines]
            updated[childIndex] = childLine

            return updated
        }

        lastChildIndex = childIndex
        childIndex += 1
    }

    const updated = [...lines]
    updated.splice(lastChildIndex + 1, 0, childLine)

    return updated
}

function childBlockEndIndex(lines: string[], startIndex: number) {
    let index = startIndex + 1

    while (index < lines.length && lines[index].startsWith(CHILD_INDENT)) index += 1

    return index
}

function rewriteListLines(lines: string[], key: string, values: string[]) {
    const keyLine = `${key}:`
    const nextLines = [keyLine, ...values.map((value) => `${LIST_ITEM_PREFIX}${value}`)]
    const keyIndex = lines.findIndex((line) => isHeaderKeyLine(line, key))

    if (keyIndex === -1) return [...lines, ...nextLines]

    const updated = [...lines]
    updated.splice(keyIndex, childBlockEndIndex(lines, keyIndex) - keyIndex, ...nextLines)

    return updated
}

function serializeNewHeader(header: NewCardHeader) {
    if (!header.id) throw new Error('Cannot generate a card without an id')
    if (!header.internalId) throw new Error('Cannot generate a card without an internalId')
    if (!header.title) throw new Error('Cannot generate a card without a title')

    const affects = header.affects ?? []
    const agentLogReferences = header.agentLogReferences ?? []
    const policy = header.policy ?? {}

    const lines: string[] = []
    lines.push(`author: ${header.author ?? ''}`)
    lines.push(`id: ${header.id}`)
    lines.push(`internalId: ${header.internalId}`)
    lines.push(`title: ${header.title}`)
    lines.push(`status: ${header.status ?? DEFAULT_IMPORTED_STATUS}`)
    lines.push(`owner: ${header.owner ?? ''}`)
    lines.push('affects:', ...affects.map((entry) => `${LIST_ITEM_PREFIX}${entry}`))
    lines.push('agents:', ...agentLogReferences.map((entry) => `${LIST_ITEM_PREFIX}${entry}`))
    lines.push('policy:', ...Object.entries(policy).map(([key, value]) => `${CHILD_INDENT}${key}: ${value}`))

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
            agentConversationErrors: [],
            agentConversations: [],
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

    setPolicyFlag(content: string, key: string, enabled: boolean) {
        const { body, hasHeader, rawHeader } = splitHeader(content)
        const startingLines = hasHeader ? rawHeader.split('\n') : []
        const nextHeader = rewritePolicyLines(startingLines, key, enabled ? 'true' : 'false').join('\n')

        if (hasHeader) return `${HEADER_DELIMITER}\n${nextHeader}\n${HEADER_DELIMITER}\n${body}`

        return `${HEADER_DELIMITER}\n${nextHeader}\n${HEADER_DELIMITER}\n\n${content}`
    },

    setAgentLogReferences(content: string, references: string[]) {
        const { body, hasHeader, rawHeader } = splitHeader(content)
        const startingLines = hasHeader ? rawHeader.split('\n') : []
        const nextHeader = rewriteListLines(startingLines, 'agents', references).join('\n')

        if (hasHeader) return `${HEADER_DELIMITER}\n${nextHeader}\n${HEADER_DELIMITER}\n${body}`

        return `${HEADER_DELIMITER}\n${nextHeader}\n${HEADER_DELIMITER}\n\n${content}`
    },

    setAffects(content: string, affects: string[]) {
        const { body, hasHeader, rawHeader } = splitHeader(content)
        const startingLines = hasHeader ? rawHeader.split('\n') : []
        const nextHeader = rewriteListLines(startingLines, 'affects', affects).join('\n')

        if (hasHeader) return `${HEADER_DELIMITER}\n${nextHeader}\n${HEADER_DELIMITER}\n${body}`

        return `${HEADER_DELIMITER}\n${nextHeader}\n${HEADER_DELIMITER}\n\n${content}`
    },

    buildCardMarkdown(header: NewCardHeader, body: string) {
        return `${HEADER_DELIMITER}\n${serializeNewHeader(header)}\n${HEADER_DELIMITER}\n\n${body}`
    },

    generateInternalId() {
        return crypto.randomUUID()
    },
}
