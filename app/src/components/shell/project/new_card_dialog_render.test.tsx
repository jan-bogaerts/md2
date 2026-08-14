import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, DEFAULT_STATES } from '../../../data/data_types'
import type { MarkdownEditorHandle } from '../../editor/markdown_editor'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { NewCardDialog } from './new_card_dialog'
import { projectSessionService } from '../../../services/project/project_session_service'
import { dialogService } from '../../../services/dialog_service'

const { editorBoundaryRender } = vi.hoisted(() => ({ editorBoundaryRender: vi.fn() }))

vi.mock('./new_card_markdown_editor', async () => {
    const { forwardRef, useImperativeHandle, useRef } = await import('react')

    interface EditorProps {
        onDirtyChange: (dirty: boolean) => void
    }

    const NewCardMarkdownEditor = forwardRef<MarkdownEditorHandle, EditorProps>(function NewCardMarkdownEditor(props, ref) {
        const editorRef = useRef<HTMLTextAreaElement>(null)
        editorBoundaryRender()
        useImperativeHandle(ref, () => ({
            flush: () => true,
            getMarkdown: () => editorRef.current?.value ?? '',
            setMarkdown: (markdown: string) => {
                if (editorRef.current) editorRef.current.value = markdown
            },
        }), [])

        const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
            props.onDirtyChange(event.currentTarget.value.length > 0)
        }

        return <textarea aria-label="Draft body" onChange={handleChange} ref={editorRef} />
    })

    return { NewCardMarkdownEditor }
})

describe('NewCardDialog editor render boundary', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not rerender the editor boundary for repeated description edits', () => {
        window.matchMedia = ((query: string) => ({
            addEventListener: () => {},
            addListener: () => {},
            dispatchEvent: () => false,
            matches: false,
            media: query,
            onchange: null,
            removeEventListener: () => {},
            removeListener: () => {},
        })) as unknown as typeof window.matchMedia

        render(
            <NewCardDialog
                cardBodyTemplate=""
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        const description = within(screen.getByRole('group', { name: 'Description' })).getByRole('textbox')
        const initialRenderCount = editorBoundaryRender.mock.calls.length
        fireEvent.change(description, { target: { value: 'One' } })
        fireEvent.change(description, { target: { value: 'One two' } })
        fireEvent.change(description, { target: { value: 'One two three' } })

        expect(editorBoundaryRender).toHaveBeenCalledTimes(initialRenderCount)
    })

    it('waits for draft image cleanup before confirmed cancellation closes the dialog', async () => {
        window.matchMedia = ((query: string) => ({
            addEventListener: () => {}, addListener: () => {}, dispatchEvent: () => false, matches: false,
            media: query, onchange: null, removeEventListener: () => {}, removeListener: () => {},
        })) as unknown as typeof window.matchMedia
        let resolveCleanup: () => void = () => undefined
        const cleanup = new Promise<void>((resolve) => { resolveCleanup = resolve })
        vi.spyOn(projectSessionService, 'hasNewCardDraftImages').mockReturnValue(true)
        vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockReturnValue(cleanup)
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const onClose = vi.fn()
        render(
            <NewCardDialog
                cardBodyTemplate=""
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={onClose}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(onClose).not.toHaveBeenCalled()

        resolveCleanup()
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    })

    it('keeps the draft open and reports failed cancellation cleanup', async () => {
        window.matchMedia = ((query: string) => ({
            addEventListener: () => {}, addListener: () => {}, dispatchEvent: () => false, matches: false,
            media: query, onchange: null, removeEventListener: () => {}, removeListener: () => {},
        })) as unknown as typeof window.matchMedia
        const cleanupError = new Error('delete failed')
        vi.spyOn(projectSessionService, 'hasNewCardDraftImages').mockReturnValue(true)
        vi.spyOn(projectSessionService, 'discardNewCardDraftImages').mockRejectedValue(cleanupError)
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        const reportError = vi.spyOn(dialogService, 'error')
        const onClose = vi.fn()
        render(
            <NewCardDialog
                cardBodyTemplate=""
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={onClose}
                onCreateCard={vi.fn(async () => undefined)}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(
            cleanupError,
            { fallbackMessage: 'Pasted draft images could not be removed' },
        ))
        expect(onClose).not.toHaveBeenCalled()
    })

    it('waits for image insertion before reading the draft body for creation', async () => {
        window.matchMedia = ((query: string) => ({
            addEventListener: () => {}, addListener: () => {}, dispatchEvent: () => false, matches: false,
            media: query, onchange: null, removeEventListener: () => {}, removeListener: () => {},
        })) as unknown as typeof window.matchMedia
        let resolveImageSave: () => void = () => undefined
        const imageSave = new Promise<void>((resolve) => { resolveImageSave = resolve })
        vi.spyOn(projectSessionService, 'waitForNewCardImageSaves').mockReturnValue(imageSave)
        const onCreateCard = vi.fn(async () => undefined)
        render(
            <NewCardDialog
                cardBodyTemplate=""
                cardTypes={DEFAULT_CARD_TYPES}
                initialTargetStatus="new"
                isLoading={false}
                isProjectOpen
                onClose={vi.fn()}
                onCreateCard={onCreateCard}
                open
                states={DEFAULT_STATES}
            />,
            { wrapper: AppThemeProvider },
        )

        fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Image card' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create card' }))
        expect(onCreateCard).not.toHaveBeenCalled()

        fireEvent.change(screen.getByRole('textbox', { name: 'Draft body' }), {target: { value: '![pasted image](<saved.png>)' }})
        resolveImageSave()

        await waitFor(() => expect(onCreateCard).toHaveBeenCalledWith({
            body: '![pasted image](<saved.png>)',
            bodyIncludesTemplate: true,
            title: 'Image card',
            type: 'feature',
        }, 'new'))
    })
})
