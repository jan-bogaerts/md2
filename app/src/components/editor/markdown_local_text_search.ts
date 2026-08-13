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

/** Finds next match at or after offset, wrapping once to document start. */
export function findMarkdownTextMatch(
    text: string,
    term: string,
    offset: number,
    caseSensitive: boolean,
): MarkdownTextMatch | null {
    if (!term) return null

    const searchableText = normalizeSearchText(text, caseSensitive)
    const searchableTerm = normalizeSearchText(term, caseSensitive)
    const startOffset = Math.min(Math.max(offset, 0), text.length)
    const laterMatch = searchableText.indexOf(searchableTerm, startOffset)
    const start = laterMatch >= 0 ? laterMatch : searchableText.indexOf(searchableTerm)

    return start < 0 ? null : { end: start + term.length, start }
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

function currentSelectionEnd(document: MarkdownSearchDocument) {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return 0

    const points = selection.getStartEndPoints()
    return points ? pointTextOffset(points[1], document) : 0
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
    return editor.getEditorState().read(() => currentSelectionEnd(createSearchDocument()))
}

/** Reads non-empty selected visible text without Markdown delimiters. */
export function getMarkdownSearchSeed(editor: LexicalEditor) {
    return editor.getEditorState().read(() => {
        const selection = $getSelection()
        return $isRangeSelection(selection) && !selection.isCollapsed() ? selection.getTextContent() : ''
    })
}

/** Selects one match without changing editor content or history. */
export function selectMarkdownTextMatch(
    editor: LexicalEditor,
    term: string,
    offset: number,
    caseSensitive: boolean,
) {
    let selectedKey: NodeKey | null = null
    let selectedMatch: MarkdownTextMatch | null = null

    editor.update(() => {
        const document = createSearchDocument()
        const match = findMarkdownTextMatch(document.text, term, offset, caseSensitive)
        if (!match) return

        const points = matchPoints(match, document.segments)
        if (!points) return

        const selection = $createRangeSelection()
        selection.anchor.set(points.anchor.key, points.anchor.offset, 'text')
        selection.focus.set(points.focus.key, points.focus.offset, 'text')
        $setSelection(selection)
        selectedKey = points.anchor.key
        selectedMatch = match
    }, {
        discrete: true,
        onUpdate: () => {
            if (selectedKey) editor.getElementByKey(selectedKey)?.scrollIntoView?.({ block: 'nearest' })
        },
    })

    return selectedMatch
}
