import {
    $createRangeSelection,
    $getRoot,
    $getSelection,
    $isElementNode,
    $isRangeSelection,
    $isTextNode,
    $setSelection,
    type LexicalEditor,
    type NodeKey,
    type PointType,
} from 'lexical'

export interface MarkdownTextMatch {
    end: number
    start: number
}

export type MarkdownTextSearchDirection = 'next' | 'previous'

export interface MarkdownTextSearchResult {
    count: number
    match: MarkdownTextMatch | null
}

interface MarkdownTextSegment {
    end: number
    key: NodeKey
    start: number
}

interface MarkdownSearchDocument {
    segments: MarkdownTextSegment[]
    text: string
}

function createSearchDocument(): MarkdownSearchDocument {
    const root = $getRoot()
    const text = root.getTextContent()
    let nextOffset = 0
    const segments = root.getAllTextNodes().flatMap((node) => {
        const nodeText = node.getTextContent()
        if (!nodeText) return []

        const start = text.indexOf(nodeText, nextOffset)
        if (start < 0) throw new Error(`Markdown search could not map text node ${node.getKey()}`)
        const end = start + nodeText.length
        nextOffset = end

        return [{ end, key: node.getKey(), start }]
    })

    return { segments, text }
}

function normalizeSearchText(value: string, caseSensitive: boolean) {
    return caseSensitive ? value : value.toLocaleLowerCase()
}

/** Enumerates ordered, non-overlapping visible-text matches. */
export function findMarkdownTextMatches(
    text: string,
    term: string,
    caseSensitive: boolean,
): MarkdownTextMatch[] {
    if (!term) return []

    const searchableText = normalizeSearchText(text, caseSensitive)
    const searchableTerm = normalizeSearchText(term, caseSensitive)
    const matches: MarkdownTextMatch[] = []
    let offset = 0

    while (offset <= searchableText.length - searchableTerm.length) {
        const start = searchableText.indexOf(searchableTerm, offset)
        if (start < 0) break

        const end = start + term.length
        matches.push({ end, start })
        offset = end
    }

    return matches
}

/** Finds match in requested direction, wrapping once at document boundary. */
export function findMarkdownTextMatch(
    matches: MarkdownTextMatch[],
    offset: number,
    direction: MarkdownTextSearchDirection,
) {
    if (matches.length === 0) return null

    if (direction === 'previous') {
        return matches.findLast(({ end }) => end <= offset) ?? matches.at(-1) ?? null
    }

    return matches.find(({ start }) => start >= offset) ?? matches[0]
}

function pointTextOffset(point: PointType, document: MarkdownSearchDocument) {
    if (point.type === 'text') {
        const segment = document.segments.find(({ key }) => key === point.key)
        return segment ? segment.start + point.offset : 0
    }

    const pointNode = point.getNode()
    const nextChild = 'getChildAtIndex' in pointNode ? pointNode.getChildAtIndex(point.offset) : null
    const nextTextKey = $isTextNode(nextChild)
        ? nextChild.getKey()
        : $isElementNode(nextChild) ? nextChild.getAllTextNodes()[0]?.getKey() : undefined
    const nextSegment = document.segments.find(({ key }) => key === nextTextKey)
    if (nextSegment) return nextSegment.start

    const pointTextKeys = new Set($isElementNode(pointNode)
        ? pointNode.getAllTextNodes().map((node) => node.getKey())
        : [])
    const lastSegment = document.segments.findLast(({ key }) => pointTextKeys.has(key))
    return lastSegment?.end ?? 0
}

function currentSelectionBoundary(document: MarkdownSearchDocument, boundary: 'end' | 'start') {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return 0

    const points = selection.getStartEndPoints()
    if (!points) return 0

    return pointTextOffset(points[boundary === 'start' ? 0 : 1], document)
}

function matchPoints(match: MarkdownTextMatch, segments: MarkdownTextSegment[]) {
    const startSegment = segments.find(({ end, start }) => match.start >= start && match.start < end)
    const endSegment = segments.find(({ end, start }) => match.end > start && match.end <= end)
    if (!startSegment || !endSegment) return null

    return {
        anchor: { key: startSegment.key, offset: match.start - startSegment.start },
        focus: { key: endSegment.key, offset: match.end - endSegment.start },
    }
}

/** Reads current Lexical selection end as flattened visible-text offset. */
export function getMarkdownSearchSelectionEnd(editor: LexicalEditor) {
    return editor.getEditorState().read(() => currentSelectionBoundary(createSearchDocument(), 'end'))
}

/** Reads current Lexical selection start as flattened visible-text offset. */
export function getMarkdownSearchSelectionStart(editor: LexicalEditor) {
    return editor.getEditorState().read(() => currentSelectionBoundary(createSearchDocument(), 'start'))
}

/** Reads non-empty selected visible text without Markdown delimiters. */
export function getMarkdownSearchSeed(editor: LexicalEditor) {
    return editor.getEditorState().read(() => {
        const selection = $getSelection()
        return $isRangeSelection(selection) && !selection.isCollapsed() ? selection.getTextContent() : ''
    })
}

function $selectTextMatch(match: MarkdownTextMatch, document: MarkdownSearchDocument) {
    const points = matchPoints(match, document.segments)
    if (!points) return null

    const selection = $createRangeSelection()
    selection.anchor.set(points.anchor.key, points.anchor.offset, 'text')
    selection.focus.set(points.focus.key, points.focus.offset, 'text')
    $setSelection(selection)
    return selection
}

function scrollNodeIntoView(editor: LexicalEditor, key: NodeKey | null) {
    if (key) editor.getElementByKey(key)?.scrollIntoView?.({ block: 'nearest' })
}

/** Selects one match without changing editor content or history. */
export function selectMarkdownTextMatch(
    editor: LexicalEditor,
    term: string,
    offset: number,
    caseSensitive: boolean,
    direction: MarkdownTextSearchDirection = 'next',
) {
    let selectedKey: NodeKey | null = null
    const result: MarkdownTextSearchResult = { count: 0, match: null }

    editor.update(() => {
        const document = createSearchDocument()
        const matches = findMarkdownTextMatches(document.text, term, caseSensitive)
        result.count = matches.length
        const match = findMarkdownTextMatch(matches, offset, direction)
        if (!match) return

        const selection = $selectTextMatch(match, document)
        if (!selection) return

        selectedKey = selection.anchor.key
        result.match = match
    }, {
        discrete: true,
        onUpdate: () => scrollNodeIntoView(editor, selectedKey),
    })

    return result
}

/**
 * Replaces current match when it still exists, then selects next remaining match after inserted text.
 * Result count and match describe document after replacement.
 */
export function replaceMarkdownTextMatch(
    editor: LexicalEditor,
    term: string,
    currentMatch: MarkdownTextMatch,
    caseSensitive: boolean,
    replacement: string,
) {
    let selectedKey: NodeKey | null = null
    const result: MarkdownTextSearchResult = { count: 0, match: null }

    editor.update(() => {
        const document = createSearchDocument()
        const matches = findMarkdownTextMatches(document.text, term, caseSensitive)
        result.count = matches.length
        const match = matches.find(({ end, start }) => start === currentMatch.start && end === currentMatch.end)
        if (!match) return

        const selection = $selectTextMatch(match, document)
        if (!selection) return

        selection.insertText(replacement)
        const nextDocument = createSearchDocument()
        const nextMatches = findMarkdownTextMatches(nextDocument.text, term, caseSensitive)
        result.count = nextMatches.length
        const nextMatch = findMarkdownTextMatch(nextMatches, match.start + replacement.length, 'next')
        if (!nextMatch) return

        const nextSelection = $selectTextMatch(nextMatch, nextDocument)
        if (!nextSelection) return

        selectedKey = nextSelection.anchor.key
        result.match = nextMatch
    }, {
        discrete: true,
        onUpdate: () => scrollNodeIntoView(editor, selectedKey),
    })

    return result
}

/**
 * Replaces every match present before the action in one editor update, from document end toward start,
 * so earlier offsets stay valid and inserted text is never searched again. Returns remaining match count.
 */
export function replaceAllMarkdownTextMatches(
    editor: LexicalEditor,
    term: string,
    caseSensitive: boolean,
    replacement: string,
) {
    let count = 0

    editor.update(() => {
        const matches = findMarkdownTextMatches($getRoot().getTextContent(), term, caseSensitive)
        for (const match of matches.toReversed()) {
            const selection = $selectTextMatch(match, createSearchDocument())
            if (!selection) throw new Error(`Markdown replace could not map match at ${match.start}`)

            selection.insertText(replacement)
        }
        count = findMarkdownTextMatches($getRoot().getTextContent(), term, caseSensitive).length
    }, { discrete: true })

    return count
}
