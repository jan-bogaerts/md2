import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    ActionConversationSearchService,
    createConversationSearchDocument,
    findConversationTextMatch,
    findConversationTextMatches,
} from './action_conversation_search_service'

function transcript() {
    const viewport = document.createElement('div')
    viewport.setAttribute('aria-label', 'Conversation chat')
    viewport.innerHTML = '<p>Alpha <strong>beta</strong> alpha</p><div hidden>secret</div>'
    document.body.append(viewport)

    return viewport
}

describe('conversation text search', () => {
    beforeEach(() => {
        document.body.replaceChildren()
        window.getSelection()?.removeAllRanges()
    })

    it('flattens visible adjacent text nodes and excludes hidden content', () => {
        const searchDocument = createConversationSearchDocument(transcript())

        expect(searchDocument.text).toBe('Alpha beta alpha')
        expect(findConversationTextMatches(searchDocument.text, 'a beta', false)).toEqual([{ end: 10, start: 4 }])
    })

    it('matches case mode and wraps in both directions', () => {
        const matches = findConversationTextMatches('Alpha alpha', 'Alpha', true)

        expect(matches).toEqual([{ end: 5, start: 0 }])
        expect(findConversationTextMatch(matches, 6, 'next')).toEqual(matches[0])
        expect(findConversationTextMatch(matches, 0, 'previous')).toEqual(matches[0])
    })
})

describe('ActionConversationSearchService', () => {
    beforeEach(() => {
        document.body.replaceChildren()
        window.getSelection()?.removeAllRanges()
        Element.prototype.scrollIntoView = vi.fn()
    })

    describe('automatic search debounce', () => {
        beforeEach(() => vi.useFakeTimers())
        afterEach(() => vi.useRealTimers())

        it('restarts the delay and searches only the latest draft after 800 ms', () => {
            const service = new ActionConversationSearchService()
            service.registerTranscript(transcript(), 'conversation-1')

            service.setDraftTerm('alpha')
            vi.advanceTimersByTime(799)
            expect(service.getSubmittedTerm()).toBe('')
            expect(service.getResultCount()).toBeNull()

            service.setDraftTerm('beta')
            vi.advanceTimersByTime(799)
            expect(service.getSubmittedTerm()).toBe('')

            vi.advanceTimersByTime(1)
            expect(service.getSubmittedTerm()).toBe('beta')
            expect(service.getResultCount()).toBe(1)
            expect(window.getSelection()?.toString()).toBe('beta')
        })

        it('clears completed state immediately and cancels pending work', () => {
            const service = new ActionConversationSearchService()
            service.registerTranscript(transcript(), 'conversation-1')
            service.setDraftTerm('alpha')
            vi.advanceTimersByTime(800)
            expect(service.getResultCount()).toBe(2)

            service.setDraftTerm('beta')
            service.setDraftTerm('')

            expect(service.getSubmittedTerm()).toBe('')
            expect(service.getResultCount()).toBeNull()
            expect(service.getActiveMatchIndex()).toBeNull()
            expect(window.getSelection()?.rangeCount).toBe(0)
            vi.advanceTimersByTime(800)
            expect(service.getResultCount()).toBeNull()
        })

        it('submits immediately and cancels the delayed duplicate', () => {
            const service = new ActionConversationSearchService()
            service.registerTranscript(transcript(), 'conversation-1')
            service.setDraftTerm('alpha')

            service.submitSearch()
            service.selectNext()
            expect(service.getActiveMatchIndex()).toBe(1)
            vi.advanceTimersByTime(800)

            expect(service.getActiveMatchIndex()).toBe(1)
        })

        it('reruns the current draft immediately when case mode changes', () => {
            const service = new ActionConversationSearchService()
            service.registerTranscript(transcript(), 'conversation-1')
            service.setDraftTerm('Alpha')

            service.toggleCaseSensitive()

            expect(service.getSubmittedTerm()).toBe('Alpha')
            expect(service.getResultCount()).toBe(1)
        })

        it('cancels pending work when transcript unmounts', () => {
            const service = new ActionConversationSearchService()
            const unregister = service.registerTranscript(transcript(), 'conversation-1')
            service.setDraftTerm('alpha')

            unregister()
            vi.advanceTimersByTime(800)

            expect(service.getSubmittedTerm()).toBe('')
            expect(service.getResultCount()).toBeNull()
        })
    })

    it('selects a match spanning text nodes and wraps navigation', () => {
        const viewport = transcript()
        const service = new ActionConversationSearchService()
        service.registerTranscript(viewport, 'conversation-1')
        service.setDraftTerm('a beta')

        service.submitSearch()

        expect(window.getSelection()?.toString()).toBe('a beta')
        expect(service.getResultCount()).toBe(1)
        expect(service.getActiveMatchIndex()).toBe(0)
        expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })

        service.selectNext()
        expect(window.getSelection()?.toString()).toBe('a beta')
        service.selectPrevious()
        expect(window.getSelection()?.toString()).toBe('a beta')
    })

    it('seeds from selection only when entire selection is inside transcript', () => {
        const viewport = transcript()
        const outside = document.body.appendChild(document.createTextNode('outside'))
        const service = new ActionConversationSearchService()
        service.registerTranscript(viewport, 'conversation-1')
        service.setDraftTerm('retained')
        const range = document.createRange()
        range.setStart(outside, 0)
        range.setEnd(outside, outside.data.length)
        window.getSelection()?.addRange(range)

        service.openSearch()
        expect(service.getDraftTerm()).toBe('retained')

        range.selectNodeContents(viewport.querySelector('strong') as HTMLElement)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
        service.openSearch()
        expect(service.getDraftTerm()).toBe('beta')
    })

    it('leaves selection unchanged for empty and missing terms', () => {
        const viewport = transcript()
        const service = new ActionConversationSearchService()
        service.registerTranscript(viewport, 'conversation-1')
        const range = document.createRange()
        range.selectNodeContents(viewport.querySelector('strong') as HTMLElement)
        window.getSelection()?.addRange(range)

        service.submitSearch()
        service.setDraftTerm('missing')
        service.submitSearch()

        expect(window.getSelection()?.toString()).toBe('beta')
        expect(service.getResultCount()).toBe(0)
    })

    it('recomputes results when visible streaming content changes', async () => {
        const viewport = transcript()
        const service = new ActionConversationSearchService()
        const unregister = service.registerTranscript(viewport, 'conversation-1')
        service.setDraftTerm('streamed')
        service.submitSearch()
        expect(service.getResultCount()).toBe(0)

        viewport.append(document.createTextNode(' streamed'))

        await vi.waitFor(() => expect(service.getResultCount()).toBe(1))
        expect(service.getTranscriptMounted()).toBe(true)
        unregister()
        expect(service.getTranscriptMounted()).toBe(false)
    })

    it('clears old selection and searches a changed conversation from its start', () => {
        const viewport = transcript()
        const service = new ActionConversationSearchService()
        service.registerTranscript(viewport, 'conversation-1')
        service.setDraftTerm('alpha')
        service.submitSearch()
        service.selectNext()
        expect(service.getActiveMatchIndex()).toBe(1)

        viewport.replaceChildren(document.createTextNode('alpha in next conversation'))
        service.updateConversation('conversation-2')

        expect(window.getSelection()?.toString()).toBe('alpha')
        expect(service.getActiveMatchIndex()).toBe(0)
        expect(service.getResultCount()).toBe(1)
    })
})
