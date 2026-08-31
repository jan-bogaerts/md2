import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, DEFAULT_STATES } from '../../../data/data_types'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { NewCardDialog } from './new_card_dialog'
import { projectSessionService } from '../../../services/project/project_session_service'
import { dialogService } from '../../../services/dialog_service'
import type { MarkdownDraft } from '../../../services/markdown/markdown_draft'

const { editorBoundaryRender } = vi.hoisted(() => ({ editorBoundaryRender: vi.fn() }))

vi.mock('./new_card_markdown_editor', () => {
    interface EditorProps {
        draft: MarkdownDraft
        overlayContainer: HTMLElement | null
    }

    function NewCardMarkdownEditor(props: EditorProps) {
        editorBoundaryRender()

        const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
            props.draft.edit(event.currentTarget.value)
        }

        if (!props.overlayContainer) return null

        return createPortal(
            <div data-radix-popper-content-wrapper="" data-testid="new-card-link-popup-wrapper" style={{ zIndex: 'auto' }}>
                <textarea aria-label="Draft body" defaultValue={props.draft.getSnapshot()} onChange={handleChange} />
            </div>,
            props.overlayContainer,
        )
    }

    return { NewCardMarkdownEditor }
})

describe('NewCardDialog editor render boundary', () => {
    afterEach(() => {
        cleanup()
        projectSessionService.newCardMarkdownDraft.replace('')
        vi.restoreAllMocks()
    })

    it('raises only the new-card link popup above the modal layer', () => {
        window.matchMedia = ((query: string) => ({
            addEventListener: () => {}, addListener: () => {}, dispatchEvent: () => false, matches: false,
            media: query, onchange: null, removeEventListener: () => {}, removeListener: () => {},
        })) as unknown as typeof window.matchMedia
        render(
            <>
                <div data-radix-popper-content-wrapper="" data-testid="regular-card-link-popup-wrapper" />
                <NewCardDialog
                    cardTypes={DEFAULT_CARD_TYPES}
                    initialTargetStatus="new"
                    isLoading={false}
                    isProjectOpen
                    onClose={vi.fn()}
                    onCreateCard={vi.fn(async () => undefined)}
                    open
                    states={DEFAULT_STATES}
                />
            </>,
            { wrapper: AppThemeProvider },
        )

        expect(screen.getByTestId('new-card-link-popup-wrapper')).toBe(
            within(screen.getByRole('group', { name: 'Description' })).getByTestId('new-card-link-popup-wrapper'),
        )
        expect(screen.getByTestId('new-card-link-popup-wrapper')).toHaveStyle({ zIndex: '1301' })
        expect(screen.getByTestId('regular-card-link-popup-wrapper')).not.toHaveStyle({ zIndex: '1301' })
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

    it('keeps footer attachment before Add to and retains body after editor unmount', () => {
        window.matchMedia = ((query: string) => ({
            addEventListener: () => {}, addListener: () => {}, dispatchEvent: () => false, matches: false,
            media: query, onchange: null, removeEventListener: () => {}, removeListener: () => {},
        })) as unknown as typeof window.matchMedia
        const view = render(
            <NewCardDialog
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
        const startGroup = screen.getByTestId('new-card-footer-start')
        const attachment = within(startGroup).getByRole('button', { name: 'Attach files' })
        const targetColumn = within(startGroup).getByRole('combobox', { name: 'Target column' })

        expect(attachment.compareDocumentPosition(targetColumn) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        fireEvent.change(screen.getByRole('textbox', { name: 'Draft body' }), { target: { value: 'Persistent body' } })
        view.unmount()
        expect(projectSessionService.newCardMarkdownDraft.getSnapshot()).toBe('Persistent body')
    })

    it('keeps attachment and Add to in the mobile footer without a second create control', () => {
        window.matchMedia = ((query: string) => ({
            addEventListener: () => {}, addListener: () => {}, dispatchEvent: () => false, matches: true,
            media: query, onchange: null, removeEventListener: () => {}, removeListener: () => {},
        })) as unknown as typeof window.matchMedia
        render(
            <NewCardDialog
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
        const startGroup = screen.getByTestId('new-card-footer-start')
        const footer = startGroup.parentElement as HTMLElement
        const targetColumn = within(startGroup).getByRole('combobox', { name: 'Target column' })

        expect(startGroup).toHaveStyle({ display: 'flex', flexDirection: 'row', width: '100%' })
        expect(targetColumn.parentElement).toHaveStyle({ flex: '1 1 0%', minWidth: '0' })
        expect(within(footer).queryByRole('button', { name: /Create/u })).toBeNull()
        expect(screen.getAllByRole('button', { name: 'Create' })).toHaveLength(1)
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
        const onClose = vi.fn()
        render(
            <NewCardDialog
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
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
        expect(onClose).not.toHaveBeenCalled()

        await act(async () => resolveCleanup())
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
        const reportError = vi.spyOn(dialogService, 'error')
        const onClose = vi.fn()
        render(
            <NewCardDialog
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
        fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

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
            title: 'Image card',
            type: 'feature',
        }, 'new'))
    })
})
