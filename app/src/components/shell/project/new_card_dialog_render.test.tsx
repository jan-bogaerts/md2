import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ChangeEvent } from 'react'
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
        onDirtyChange: (dirty: boolean) => void
    }

    function NewCardMarkdownEditor(props: EditorProps) {
        editorBoundaryRender()

        const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
            props.draft.edit(event.currentTarget.value)
            props.onDirtyChange(event.currentTarget.value.length > 0)
        }

        return <textarea aria-label="Draft body" defaultValue={props.draft.getSnapshot()} onChange={handleChange} />
    }

    return { NewCardMarkdownEditor }
})

describe('NewCardDialog editor render boundary', () => {
    afterEach(() => {
        cleanup()
        projectSessionService.newCardMarkdownDraft.replace('')
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

    it('keeps footer attachment before Add to and retains body after editor unmount', () => {
        window.matchMedia = ((query: string) => ({
            addEventListener: () => {}, addListener: () => {}, dispatchEvent: () => false, matches: false,
            media: query, onchange: null, removeEventListener: () => {}, removeListener: () => {},
        })) as unknown as typeof window.matchMedia
        const view = render(
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
        const startGroup = screen.getByTestId('new-card-footer-start')
        const attachment = within(startGroup).getByRole('button', { name: 'Attach files' })
        const targetColumn = within(startGroup).getByRole('combobox', { name: 'Target column' })

        expect(attachment.compareDocumentPosition(targetColumn) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
        fireEvent.change(screen.getByRole('textbox', { name: 'Draft body' }), { target: { value: 'Persistent body' } })
        view.unmount()
        expect(projectSessionService.newCardMarkdownDraft.getSnapshot()).toBe('Persistent body')
    })

    it('keeps attachment and Add to in first mobile footer row with Create below', () => {
        window.matchMedia = ((query: string) => ({
            addEventListener: () => {}, addListener: () => {}, dispatchEvent: () => false, matches: true,
            media: query, onchange: null, removeEventListener: () => {}, removeListener: () => {},
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
        const startGroup = screen.getByTestId('new-card-footer-start')
        const footer = startGroup.parentElement as HTMLElement
        const targetColumn = within(startGroup).getByRole('combobox', { name: 'Target column' })
        const create = within(footer).getByRole('button', { name: 'Create card' })

        expect(startGroup).toHaveStyle({ display: 'flex', flexDirection: 'row', width: '100%' })
        expect(targetColumn.parentElement).toHaveStyle({ flex: '1 1 0%', minWidth: '0' })
        expect(startGroup.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
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
