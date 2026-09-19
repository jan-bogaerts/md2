const HEADER_DELIMITER = '---'
const LIST_ITEM_PREFIX = '  - '
const CHILD_INDENT = '  '

/**
 * Splits markdown into its frontmatter header and its body. Content without a well-formed
 * header is reported as a body-only document rather than treated as an error, because plain
 * markdown documents live next to cards in the same folders.
 */
export function splitHeader(content) {
    if (!content.startsWith(`${HEADER_DELIMITER}\n`) && !content.startsWith(`${HEADER_DELIMITER}\r\n`)) {
        return { body: content, hasHeader: false, rawHeader: '' }
    }

    const closingDelimiter = /\r?\n---\r?\n/g
    closingDelimiter.lastIndex = HEADER_DELIMITER.length
    const closingMatch = closingDelimiter.exec(content)

    if (!closingMatch) return { body: content, hasHeader: false, rawHeader: '' }

    const headerStart = content.indexOf('\n') + 1
    const rawHeader = content.slice(headerStart, closingMatch.index).replace(/\r\n/gu, '\n')
    const body = content.slice(closingMatch.index + closingMatch[0].length)

    return { body, hasHeader: true, rawHeader }
}

function parseListValue(lines, startIndex) {
    const values = []
    let index = startIndex + 1

    while (index < lines.length && lines[index].startsWith(LIST_ITEM_PREFIX)) {
        values.push(lines[index].slice(LIST_ITEM_PREFIX.length).trim())
        index += 1
    }

    return { nextIndex: index, values }
}

function parseMapValue(lines, startIndex) {
    const value = {}
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

/** Parses frontmatter lines into scalar, list and map fields. */
export function parseHeaderFields(headerText) {
    const fields = {}
    const lines = headerText.split(/\r?\n/u)
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

/**
 * Reads the card identity and status straight from markdown content. Returns null when the
 * content carries no frontmatter or no `internalId`, which is how non-card markdown is told apart.
 */
export function readCardIdentity(content) {
    const { hasHeader, rawHeader } = splitHeader(content)
    if (!hasHeader) return null

    const fields = parseHeaderFields(rawHeader)
    const internalId = typeof fields.internalId === 'string' ? fields.internalId.trim() : ''
    if (internalId.length === 0) return null
    const status = typeof fields.status === 'string' ? fields.status.trim() : ''

    return { internalId, status }
}
