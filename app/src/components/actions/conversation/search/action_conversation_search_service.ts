export interface ConversationTextMatch {
    end: number
    start: number
}

export type ConversationSearchDirection = 'next' | 'previous'

interface ConversationSearchKeyboardEvent {
    altKey: boolean
    ctrlKey: boolean
    key: string
    metaKey: boolean
    preventDefault: () => void
    stopPropagation: () => void
}

interface ConversationTextSegment {
    end: number
    node: Text
    start: number
}

interface ConversationSearchDocument {
    segments: ConversationTextSegment[]
    text: string
    viewport: HTMLElement
}

const ACTIVE_MATCH_CHANGED_EVENT = 'active-match-changed'
const CASE_SENSITIVE_CHANGED_EVENT = 'case-sensitive-changed'
const DRAFT_TERM_CHANGED_EVENT = 'draft-term-changed'
const OPEN_CHANGED_EVENT = 'open-changed'
const RESULT_COUNT_CHANGED_EVENT = 'result-count-changed'
const SUBMITTED_TERM_CHANGED_EVENT = 'submitted-term-changed'
const TRANSCRIPT_MOUNTED_CHANGED_EVENT = 'transcript-mounted-changed'

function elementIsVisible(element: Element, viewport: HTMLElement) {
    for (let current: Element | null = element; current && current !== viewport; current = current.parentElement) {
        if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return false

        const style = window.getComputedStyle(current)
        if (style.display === 'none' || style.visibility === 'hidden') return false
    }

    return true
}

/** Builds ordered visible text and offset-to-DOM mappings for one transcript viewport. */
export function createConversationSearchDocument(viewport: HTMLElement): ConversationSearchDocument {
    const walker = document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT)
    const segments: ConversationTextSegment[] = []
    const textParts: string[] = []
    let offset = 0
    let node = walker.nextNode()
    while (node) {
        const textNode = node as Text
        const value = textNode.data
        const parentElement = textNode.parentElement
        if (value && parentElement && elementIsVisible(parentElement, viewport)) {
            const end = offset + value.length
            segments.push({ end, node: textNode, start: offset })
            textParts.push(value)
            offset = end
        }
        node = walker.nextNode()
    }

    return { segments, text: textParts.join(''), viewport }
}

function normalizedText(value: string, caseSensitive: boolean) {
    return caseSensitive ? value : value.toLocaleLowerCase()
}

/** Returns ordered, non-overlapping visible-text matches. */
export function findConversationTextMatches(text: string, term: string, caseSensitive: boolean) {
    if (!term) return []

    const searchableText = normalizedText(text, caseSensitive)
    const searchableTerm = normalizedText(term, caseSensitive)
    const matches: ConversationTextMatch[] = []
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

/** Finds next or previous match, wrapping once at transcript boundaries. */
export function findConversationTextMatch(
    matches: ConversationTextMatch[],
    offset: number,
    direction: ConversationSearchDirection,
) {
    if (matches.length === 0) return null
    if (direction === 'previous') return matches.findLast(({ end }) => end <= offset) ?? matches.at(-1) ?? null

    return matches.find(({ start }) => start >= offset) ?? matches[0]
}

function rangeForMatch(searchDocument: ConversationSearchDocument, match: ConversationTextMatch) {
    const startSegment = searchDocument.segments.find(({ end, start }) => match.start >= start && match.start < end)
    const endSegment = searchDocument.segments.find(({ end, start }) => match.end > start && match.end <= end)
    if (!startSegment || !endSegment) return null

    const range = document.createRange()
    range.setStart(startSegment.node, match.start - startSegment.start)
    range.setEnd(endSegment.node, match.end - endSegment.start)

    return range
}

function selectionInsideViewport(viewport: HTMLElement) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed || !selection.toString()) return null

    const range = selection.getRangeAt(0)
    if (!viewport.contains(range.startContainer) || !viewport.contains(range.endContainer)) return null

    return range
}

function textPointOffset(searchDocument: ConversationSearchDocument, container: Node, offset: number) {
    if (container.nodeType === Node.TEXT_NODE) {
        const segment = searchDocument.segments.find(({ node }) => node === container)
        if (segment) return segment.start + Math.min(offset, segment.end - segment.start)
    }

    const boundaryRange = document.createRange()
    boundaryRange.setStart(searchDocument.viewport, 0)
    boundaryRange.setEnd(container, offset)

    return searchDocument.segments.reduce((length, segment) => {
        if (!boundaryRange.intersectsNode(segment.node)) return length
        if (container === segment.node) return length + Math.min(offset, segment.end - segment.start)

        return length + segment.end - segment.start
    }, 0)
}

/** Popup-local owner of conversation-search state and DOM selection. */
export class ActionConversationSearchService extends EventTarget {
    private activeMatch: ConversationTextMatch | null = null
    private caseSensitive = false
    private conversationId: string | null = null
    private draftTerm = ''
    private mutationObserver: MutationObserver | null = null
    private open = false
    private resultCount: number | null = null
    private searchOrigin = 0
    private submittedTerm = ''
    private viewport: HTMLElement | null = null

    readonly getActiveMatchIndex = () => {
        if (!this.activeMatch || !this.viewport || !this.submittedTerm) return null

        const searchDocument = createConversationSearchDocument(this.viewport)
        const matches = findConversationTextMatches(searchDocument.text, this.submittedTerm, this.caseSensitive)

        return matches.findIndex(({ end, start }) => start === this.activeMatch?.start && end === this.activeMatch.end)
    }

    readonly getCaseSensitive = () => this.caseSensitive
    readonly getDraftTerm = () => this.draftTerm
    readonly getOpen = () => this.open
    readonly getResultCount = () => this.resultCount
    readonly getSubmittedTerm = () => this.submittedTerm
    readonly getTranscriptMounted = () => !!this.viewport && !!this.conversationId

    subscribeActiveMatch = this.subscribe(ACTIVE_MATCH_CHANGED_EVENT)
    subscribeCaseSensitive = this.subscribe(CASE_SENSITIVE_CHANGED_EVENT)
    subscribeDraftTerm = this.subscribe(DRAFT_TERM_CHANGED_EVENT)
    subscribeOpen = this.subscribe(OPEN_CHANGED_EVENT)
    subscribeResultCount = this.subscribe(RESULT_COUNT_CHANGED_EVENT)
    subscribeSubmittedTerm = this.subscribe(SUBMITTED_TERM_CHANGED_EVENT)
    subscribeTranscriptMounted = this.subscribe(TRANSCRIPT_MOUNTED_CHANGED_EVENT)

    registerTranscript(viewport: HTMLElement, conversationId: string | null) {
        this.disconnectObserver()
        this.viewport = viewport
        this.mutationObserver = new MutationObserver(this.refreshMatches)
        this.mutationObserver.observe(viewport, { characterData: true, childList: true, subtree: true })
        this.updateConversation(conversationId)

        return () => {
            if (this.viewport !== viewport) return

            const mounted = this.getTranscriptMounted()
            this.disconnectObserver()
            this.clearOwnedSelection()
            this.viewport = null
            this.conversationId = null
            if (mounted) this.publish(TRANSCRIPT_MOUNTED_CHANGED_EVENT)
        }
    }

    updateConversation(conversationId: string | null) {
        if (this.conversationId === conversationId) return

        const wasMounted = this.getTranscriptMounted()
        this.clearOwnedSelection()
        this.conversationId = conversationId
        this.setActiveMatch(null)
        if (wasMounted !== this.getTranscriptMounted()) this.publish(TRANSCRIPT_MOUNTED_CHANGED_EVENT)
        if (conversationId && this.submittedTerm) this.searchFrom(0, 'next')
    }

    openSearch() {
        if (!this.viewport || !this.conversationId) return

        const range = selectionInsideViewport(this.viewport)
        if (range) {
            const selectedText = range.toString()
            this.setDraftTerm(selectedText)
            this.searchOrigin = textPointOffset(
                createConversationSearchDocument(this.viewport),
                range.endContainer,
                range.endOffset,
            )
        } else this.searchOrigin = 0
        if (!this.open) {
            this.open = true
            this.publish(OPEN_CHANGED_EVENT)
        }
    }

    closeSearch() {
        if (!this.open) return

        this.open = false
        this.publish(OPEN_CHANGED_EVENT)
    }

    setDraftTerm(term: string) {
        if (this.draftTerm === term) return

        this.draftTerm = term
        this.publish(DRAFT_TERM_CHANGED_EVENT)
    }

    toggleCaseSensitive() {
        this.caseSensitive = !this.caseSensitive
        this.publish(CASE_SENSITIVE_CHANGED_EVENT)
        if (this.submittedTerm) this.searchFrom(this.activeMatch?.start ?? 0, 'next')
    }

    submitSearch() {
        if (!this.draftTerm) return

        if (this.submittedTerm !== this.draftTerm) {
            this.submittedTerm = this.draftTerm
            this.publish(SUBMITTED_TERM_CHANGED_EVENT)
        }
        this.searchFrom(this.searchOrigin, 'next')
    }

    selectNext() {
        if (!this.submittedTerm) return

        this.searchFrom(this.activeMatch?.end ?? 0, 'next')
    }

    selectPrevious() {
        if (!this.submittedTerm) return

        this.searchFrom(this.activeMatch?.start ?? 0, 'previous')
    }

    handlePopupKeyDown(event: ConversationSearchKeyboardEvent) {
        const opensSearch = event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'f'
        if (opensSearch && this.getTranscriptMounted()) {
            event.preventDefault()
            this.openSearch()
            return
        }
        if (event.key === 'Escape' && this.open) {
            event.preventDefault()
            event.stopPropagation()
            this.closeSearch()
            return
        }
        if (event.key !== 'F3' || !this.submittedTerm || !this.getTranscriptMounted()) return

        event.preventDefault()
        this.selectNext()
    }

    private readonly refreshMatches = () => {
        if (!this.viewport || !this.submittedTerm) return

        const searchDocument = createConversationSearchDocument(this.viewport)
        const matches = findConversationTextMatches(searchDocument.text, this.submittedTerm, this.caseSensitive)
        this.setResultCount(matches.length)
        if (!this.activeMatch) return

        const retainedMatch = matches.find(({ end, start }) => (
            start === this.activeMatch?.start && end === this.activeMatch.end
        ))
        if (!retainedMatch) {
            this.setActiveMatch(null)
            return
        }
        this.selectMatch(searchDocument, retainedMatch)
    }

    private searchFrom(offset: number, direction: ConversationSearchDirection) {
        if (!this.viewport) return

        const searchDocument = createConversationSearchDocument(this.viewport)
        const matches = findConversationTextMatches(searchDocument.text, this.submittedTerm, this.caseSensitive)
        this.setResultCount(matches.length)
        const match = findConversationTextMatch(matches, offset, direction)
        if (!match) return

        this.selectMatch(searchDocument, match)
    }

    private selectMatch(searchDocument: ConversationSearchDocument, match: ConversationTextMatch) {
        const range = rangeForMatch(searchDocument, match)
        if (!range) return

        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        range.startContainer.parentElement?.scrollIntoView?.({ block: 'nearest' })
        this.setActiveMatch(match)
    }

    private clearOwnedSelection() {
        if (!this.activeMatch) return

        window.getSelection()?.removeAllRanges()
    }

    private setActiveMatch(match: ConversationTextMatch | null) {
        if (this.activeMatch?.start === match?.start && this.activeMatch?.end === match?.end) return

        this.activeMatch = match
        this.publish(ACTIVE_MATCH_CHANGED_EVENT)
    }

    private setResultCount(count: number) {
        if (this.resultCount === count) return

        this.resultCount = count
        this.publish(RESULT_COUNT_CHANGED_EVENT)
    }

    private disconnectObserver() {
        this.mutationObserver?.disconnect()
        this.mutationObserver = null
    }

    private subscribe(eventType: string) {
        return (listener: () => void) => {
            this.addEventListener(eventType, listener)

            return () => this.removeEventListener(eventType, listener)
        }
    }

    private publish(eventType: string) {
        this.dispatchEvent(new Event(eventType))
    }
}
