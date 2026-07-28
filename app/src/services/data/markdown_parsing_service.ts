import type { CardHeader, MarkdownFile, ProjectCard } from '../../data/data_types'
import { generateUuid } from '../../data/uuid'

const HEADER_DELIMITER = '---'
const MARKDOWN_EXTENSION = '.md'
const DEFAULT_IMPORTED_STATUS = 'new'
const DEFAULT_IMPORTED_ID = 'F_0'
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

export interface CardParseError {
    error: unknown
    path: string
}

export interface NewCardHeader {
    affects?: string[]
    /** Activity conversation references serialized through the existing `agents` frontmatter field. */
    agentLogReferences?: string[]
    author?: string | null
    id: string
    internalId: string
    owner?: string | null
    policy?: Record<string, boolean>
    status?: string | null
    title: string
}

interface HeaderSplit {
    body: string
    hasHeader: boolean
    rawHeader: string
}

function detectLineEnding(content: string) {
    return content.includes('\r\n') ? '\r\n' : '\n'
}

function splitHeader(content: string): HeaderSplit {
    if (!content.startsWith(`${HEADER_DELIMITER}\n`) && !content.startsWith(`${HEADER_DELIMITER}\r\n`)) {
        return { body: content, hasHeader: false, rawHeader: '' }
    }

    const closingDelimiter = /\r?\n---\r?\n/g
    closingDelimiter.lastIndex = HEADER_DELIMITER.length
    const closingMatch = closingDelimiter.exec(content)

    if (!closingMatch) return { body: content, hasHeader: false, rawHeader: '' }

    const headerStart = content.indexOf('\n') + 1
    const rawHeader = content.slice(headerStart, closingMatch.index).replace(/\r\n/g, '\n')
    const body = content.slice(closingMatch.index + closingMatch[0].length)

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

function parsePolicyMap(fields: MarkdownHeaderFields): Record<string, boolean> {
    const policy = getMapField(fields, 'policy')

    return Object.fromEntries(Object.entries(policy).map(([key, value]) => [key, parsePolicyValue(value)]))
}

function parsePolicyValue(value: string) {
    const normalized = value.toLowerCase()

    // Invalid policy values parse as false until markdown parsing exposes warnings.
    return normalized === 'true'
}

function parseWorktree(fields: MarkdownHeaderFields) {
    const value = fields.worktree
    if (value === undefined) return { worktree: null, worktreeError: null, worktreeValue: null }
    if (typeof value !== 'string' || !/^[1-9]\d*$/u.test(value)) {
        return { worktree: null, worktreeError: `Invalid worktree value: ${String(value)}`, worktreeValue: String(value) }
    }

    const worktree = Number.parseInt(value, 10)
    if (!Number.isSafeInteger(worktree)) return { worktree: null, worktreeError: `Invalid worktree value: ${value}`, worktreeValue: value }

    return { worktree, worktreeError: null, worktreeValue: value }
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
    return /^[A-Z]+([_-])\d+\1.+\.md$/u.test(getFileName(path))
}

function parseCardHeader(fields: MarkdownHeaderFields, file: MarkdownFile, body: string): CardHeader {
    const fileName = getFileName(file.path)
    const fileId = fileName.match(/^([A-Z]+([_-])\d+)\2/u)?.[1] ?? null
    const id = getStringField(fields, 'id') ?? fileId ?? DEFAULT_IMPORTED_ID
    const title = getStringField(fields, 'title') ?? getTitleFromBody(body)
    const status = getStringField(fields, 'status') ?? (followsCardNamingConvention(file.path) ? null : DEFAULT_IMPORTED_STATUS)
    const worktree = parseWorktree(fields)

    return {
        affects: getListField(fields, 'affects'),
        after: getStringField(fields, 'after'),
        agentLogReferences: getListField(fields, 'agents'),
        author: getStringField(fields, 'author'),
        id,
        internalId: getStringField(fields, 'internalId'),
        owner: getStringField(fields, 'owner'),
        policy: parsePolicyMap(fields),
        status,
        title,
        ...worktree,
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

function removeHeaderField(lines: string[], key: string) {
    const keyIndex = lines.findIndex((line) => isHeaderKeyLine(line, key))
    if (keyIndex === -1) return lines

    const updated = [...lines]
    updated.splice(keyIndex, childBlockEndIndex(lines, keyIndex) - keyIndex)

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

function frameDocument(headerLines: string[], body: string, lineEnding: string) {
    return `${HEADER_DELIMITER}${lineEnding}${headerLines.join(lineEnding)}${lineEnding}${HEADER_DELIMITER}${lineEnding}${body}`
}

function replaceCardBodyTitle(body: string, title: string) {
    return body.replace(/^# .*$/m, `${TITLE_PREFIX}${title}`)
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
    lines.push('policy:', ...Object.entries(policy).map(([key, value]) => `${CHILD_INDENT}${key}: ${value ? 'true' : 'false'}`))

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

    /**
     * Parses a markdown file into a card. `isActive` marks the working folder root files,
     * which are the only ones that are always cards and always get an `internalId`.
     * Archived and released files are cards when they already carry an `internalId`;
     * all other markdown is a regular document that never receives one.
     * See the card classification rule in design/architecture/current_data_model.md.
     */
    parseCard(file: MarkdownFile, workingFolder: string): ProjectCard {
        const { body, rawHeader } = splitHeader(file.content)
        const fields = parseHeaderFields(rawHeader)

        return {
            agentConversationErrors: [],
            agentConversations: [],
            content: body,
            header: parseCardHeader(fields, file, body),
            headerFields: fields,
            isActive: isRootWorkingFolderFile(file.path, workingFolder),
            path: file.path,
            sha: file.sha,
        }
    },

    splitCards(files: MarkdownFile[], workingFolder: string) {
        const markdownFiles = files.filter((file) => isMarkdownFile(file.path))
        const activeCards: ProjectCard[] = []
        const backgroundCards: ProjectCard[] = []
        const parseErrors: CardParseError[] = []

        for (const file of markdownFiles) {
            try {
                const card = this.parseCard(file, workingFolder)
                const targetCards = card.isActive ? activeCards : backgroundCards
                targetCards.push(card)
            } catch (error) {
                parseErrors.push({ error, path: file.path })
            }
        }

        return { activeCards, backgroundCards, parseErrors }
    },

    replaceBody(content: string, body: string) {
        const { hasHeader, rawHeader } = splitHeader(content)

        if (!hasHeader) return body

        return frameDocument(rawHeader.split('\n'), body, detectLineEnding(content))
    },

    rewriteHeader(content: string, updates: Record<string, string>) {
        const { body, hasHeader, rawHeader } = splitHeader(content)
        const lineEnding = detectLineEnding(content)
        const startingLines = hasHeader ? rawHeader.split('\n') : []
        const nextLines = Object.entries(updates).reduce(
            (lines, [key, value]) => rewriteHeaderLine(lines, key, value),
            startingLines,
        )

        if (hasHeader) return frameDocument(nextLines, body, lineEnding)

        return frameDocument(nextLines, `${lineEnding}${content}`, lineEnding)
    },

    setCardTitle(content: string, title: string) {
        const contentWithHeaderTitle = this.rewriteHeader(content, { title })
        const { body, rawHeader } = splitHeader(contentWithHeaderTitle)

        return frameDocument(rawHeader.split('\n'), replaceCardBodyTitle(body, title), detectLineEnding(contentWithHeaderTitle))
    },

    setPolicyFlag(content: string, key: string, enabled: boolean) {
        const { body, hasHeader, rawHeader } = splitHeader(content)
        const lineEnding = detectLineEnding(content)
        const startingLines = hasHeader ? rawHeader.split('\n') : []
        const nextLines = rewritePolicyLines(startingLines, key, enabled ? 'true' : 'false')

        if (hasHeader) return frameDocument(nextLines, body, lineEnding)

        return frameDocument(nextLines, `${lineEnding}${content}`, lineEnding)
    },

    setAgentLogReferences(content: string, references: string[]) {
        const { body, hasHeader, rawHeader } = splitHeader(content)
        const lineEnding = detectLineEnding(content)
        const startingLines = hasHeader ? rawHeader.split('\n') : []
        const nextLines = rewriteListLines(startingLines, 'agents', references)

        if (hasHeader) return frameDocument(nextLines, body, lineEnding)

        return frameDocument(nextLines, `${lineEnding}${content}`, lineEnding)
    },

    setAffects(content: string, affects: string[]) {
        const { body, hasHeader, rawHeader } = splitHeader(content)
        const lineEnding = detectLineEnding(content)
        const startingLines = hasHeader ? rawHeader.split('\n') : []
        const nextLines = rewriteListLines(startingLines, 'affects', affects)

        if (hasHeader) return frameDocument(nextLines, body, lineEnding)

        return frameDocument(nextLines, `${lineEnding}${content}`, lineEnding)
    },

    setWorktree(content: string, worktree: number | null) {
        if (worktree !== null && (!Number.isSafeInteger(worktree) || worktree <= 0)) {
            throw new Error(`Invalid card worktree index: ${worktree}`)
        }

        const { body, hasHeader, rawHeader } = splitHeader(content)
        const lineEnding = detectLineEnding(content)
        const startingLines = hasHeader ? rawHeader.split('\n') : []
        const nextLines = worktree === null
            ? removeHeaderField(startingLines, 'worktree')
            : rewriteHeaderLine(startingLines, 'worktree', String(worktree))

        if (hasHeader) return frameDocument(nextLines, body, lineEnding)

        return frameDocument(nextLines, `${lineEnding}${content}`, lineEnding)
    },

    buildCardMarkdown(header: NewCardHeader, body: string) {
        return `${HEADER_DELIMITER}\n${serializeNewHeader(header)}\n${HEADER_DELIMITER}\n\n${body}`
    },

    generateInternalId() {
        return generateUuid()
    },
}
