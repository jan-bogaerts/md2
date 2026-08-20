import { describe, expect, it, vi } from 'vitest'
import {
    MARKDOWN_INSERTION_REQUESTED_EVENT,
    MarkdownDraft,
    type MarkdownInsertionRequest,
} from './markdown_draft'

describe('MarkdownDraft', () => {
    it('publishes edits and external replacements through separate subscriptions', () => {
        const draft = new MarkdownDraft('Initial')
        const valueListener = vi.fn()
        const editorListener = vi.fn()
        draft.subscribe(valueListener)
        draft.subscribeEditor(editorListener)

        draft.edit('Typed')
        draft.replace('External')

        expect(draft.getSnapshot()).toBe('External')
        expect(valueListener).toHaveBeenCalledTimes(2)
        expect(editorListener).toHaveBeenCalledOnce()
        expect(draft.getEditorSnapshot()).toEqual({ replacementRevision: 1 })
    })

    it('resolves an insertion after mounted consumer acknowledgement', async () => {
        const draft = new MarkdownDraft('')
        const insertionListener = (event: Event) => {
            const request = (event as CustomEvent<MarkdownInsertionRequest>).detail
            expect(request.markdown).toBe('[report](<report.pdf>)')
            request.acknowledge()
        }
        draft.addEventListener(MARKDOWN_INSERTION_REQUESTED_EVENT, insertionListener)

        await expect(draft.requestInsertion('[report](<report.pdf>)')).resolves.toBeUndefined()
    })

    it('rejects an insertion when mounted consumer cannot apply it', async () => {
        const draft = new MarkdownDraft('')
        const insertionError = new Error('editor rejected insertion')
        const insertionListener = (event: Event) => {
            const request = (event as CustomEvent<MarkdownInsertionRequest>).detail
            request.reject(insertionError)
        }
        draft.addEventListener(MARKDOWN_INSERTION_REQUESTED_EVENT, insertionListener)

        await expect(draft.requestInsertion('content')).rejects.toBe(insertionError)
    })

    it('rejects an insertion when no editor is mounted', async () => {
        const draft = new MarkdownDraft('')

        await expect(draft.requestInsertion('content')).rejects.toThrow('Markdown insertion requires a mounted editor')
    })
})
