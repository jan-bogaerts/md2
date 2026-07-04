import type { MarkdownFile, ProjectCard } from './data_types'

const HEADER_DELIMITER = '---'
const MARKDOWN_EXTENSION = '.md'
const DEFAULT_IMPORTED_STATUS = 'new'
const TITLE_PREFIX = '# '

interface ParsedHeader {
    body: string
    fields: Record<string, string | string[]>
}

function parseListValue(lines: string[], startIndex: number) {
    const values: string[] = []
    let index = startIndex + 1

    while (index < lines.length && lines[index].startsWith('  - ')) {
        values.push(lines[index].slice(4).trim())
        index += 1
    }

    return { nextIndex: index, values }
}

function parseHeaderFields(headerText: string) {
    const fields: Record<string, string | string[]> = {}
    const lines = headerText.split(/\r?\n/)
    let index = 0

    while (index < lines.length) {
        const line = lines[index]
        const separatorIndex = line.indexOf(':')

        if (separatorIndex === -1) {
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

        const listValue = parseListValue(lines, index)
        fields[key] = listValue.values
        index = listValue.nextIndex
    }

    return fields
}

function parseHeader(content: string): ParsedHeader {
    if (!content.startsWith(`${HEADER_DELIMITER}\n`) && !content.startsWith(`${HEADER_DELIMITER}\r\n`)) {
        return { body: content, fields: {} }
    }

    const normalizedContent = content.replace(/\r\n/g, '\n')
    const closingDelimiterIndex = normalizedContent.indexOf(`\n${HEADER_DELIMITER}\n`, HEADER_DELIMITER.length + 1)

    if (closingDelimiterIndex === -1) return { body: content, fields: {} }

    const headerText = normalizedContent.slice(HEADER_DELIMITER.length + 1, closingDelimiterIndex)
    const body = normalizedContent.slice(closingDelimiterIndex + HEADER_DELIMITER.length + 2)

    return { body, fields: parseHeaderFields(headerText) }
}

function getStringField(fields: Record<string, string | string[]>, fieldName: string) {
    const value = fields[fieldName]

    return typeof value === 'string' && value.length > 0 ? value : null
}

function getListField(fields: Record<string, string | string[]>, fieldName: string) {
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

export function isMarkdownFile(path: string) {
    return path.toLowerCase().endsWith(MARKDOWN_EXTENSION)
}

export function isRootWorkingFolderFile(path: string, workingFolder: string) {
    const normalizedPath = path.replace(/\\/g, '/')
    const prefix = `${workingFolder}/`
    const remainingPath = normalizedPath.startsWith(prefix) ? normalizedPath.slice(prefix.length) : normalizedPath

    return !remainingPath.includes('/') && isMarkdownFile(remainingPath)
}

export function followsCardNamingConvention(path: string) {
    return /^[A-Z]+-\d+-.+\.md$/u.test(getFileName(path))
}

export function parseMarkdownCard(file: MarkdownFile, workingFolder: string): ProjectCard {
    const { body, fields } = parseHeader(file.content)
    const fileName = getFileName(file.path)
    const fileId = fileName.match(/^([A-Z]+-\d+)-/u)?.[1] ?? null
    const id = getStringField(fields, 'id') ?? fileId ?? 'F-0'
    const title = getStringField(fields, 'title') ?? getTitleFromBody(body)
    const status = getStringField(fields, 'status') ?? (followsCardNamingConvention(file.path) ? null : DEFAULT_IMPORTED_STATUS)

    return {
        content: body,
        header: {
            affects: getListField(fields, 'affects'),
            id,
            internalId: getStringField(fields, 'internalId'),
            owner: getStringField(fields, 'owner'),
            status,
            title,
        },
        isActive: isRootWorkingFolderFile(file.path, workingFolder),
        path: file.path,
        sha: file.sha,
    }
}

export function splitProjectCards(files: MarkdownFile[], workingFolder: string) {
    const markdownFiles = files.filter((file) => isMarkdownFile(file.path))
    const activeCards = markdownFiles
        .filter((file) => isRootWorkingFolderFile(file.path, workingFolder))
        .map((file) => parseMarkdownCard(file, workingFolder))
    const backgroundCards = markdownFiles
        .filter((file) => !isRootWorkingFolderFile(file.path, workingFolder))
        .map((file) => parseMarkdownCard(file, workingFolder))

    return { activeCards, backgroundCards }
}
