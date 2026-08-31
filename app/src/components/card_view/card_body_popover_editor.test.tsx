import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type Card } from '../../data/data_types'
import { actionService } from '../../services/actions/action_service'
import { cardPopupService } from '../../services/card_popup_service'
import { dataService } from '../../services/data/data_service'
import { openFilesService } from '../../services/open_files_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { CardBodyPopover } from './card_body_popover'

vi.mock('../hooks/use_card_commits', () => ({useCardCommits: () => ({ commits: [], error: null })}))
vi.mock('./card_body_save_status', () => ({ CardBodySaveStatus: () => null }))

const card: Card = {
    agentConversationErrors: [],
    agentConversations: [],
    content: '# Card\n\nOriginal body',
    hasFrontmatter: true,
    header: {
        affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id: 'B-172', internalId: 'card-172',
        owner: null, policy: {}, references: [], status: 'ready', title: 'History teardown', worktree: null,
        worktreeError: null, worktreeValue: null,
    },
    isActive: true,
    path: 'design/B-172.md',
}
const states = [{ alwaysVisible: true, state: 'ready' }]
let anchorElement: HTMLButtonElement | null = null

function openPopover() {
    if (!anchorElement) anchorElement = document.body.appendChild(document.createElement('button'))
    cardPopupService.toggleCardDetails(card.header.internalId!, anchorElement)
}

function renderPopover() {
    return render(
        <AppThemeProvider>
            <CardBodyPopover
                cardTypes={DEFAULT_CARD_TYPES}
                isMobile={false}
                onDeleteCard={vi.fn(async () => undefined)}
                onOpenAffects={vi.fn()}
                onOpenInFileMode={vi.fn()}
                states={states}
                statusColors={new Map()}
                visible
            />
        </AppThemeProvider>,
    )
}

function markdownTextbox() {
    const textbox = document.querySelector('[data-testid="mdx-editor"] textarea')
    if (!(textbox instanceof HTMLTextAreaElement)) throw new Error('Missing card body Markdown textbox')
    return textbox
}

describe('CardBodyPopover editor cleanup', () => {
    beforeEach(() => {
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: null,
            runningAgents: [],
            snapshot: { activeCards: [card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
        openFilesService.init({ actionService, dataService })
    })

    afterEach(() => {
        cleanup()
        cardPopupService.clear()
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        anchorElement?.remove()
        anchorElement = null
        vi.restoreAllMocks()
    })

    it('clears binding, discards history, and closes a clean board document without committing', async () => {
        const updateCardBody = vi.spyOn(dataService.cards, 'updateCardBody').mockImplementation(() => card)
        const setBoardDocument = vi.spyOn(CardMarkdownDataSource.prototype, 'setBoardDocument')
        const discardDocument = vi.spyOn(MarkdownDocumentHistoryStore.prototype, 'discardDocument')
        const closeBoardDocument = vi.spyOn(openFilesService, 'closeBoardDocument')
        openPopover()
        renderPopover()
        expect(markdownTextbox()).toHaveValue(card.content)

        fireEvent.click(screen.getByRole('button', { name: 'Close card details' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(updateCardBody).not.toHaveBeenCalled()
        expect(setBoardDocument).toHaveBeenCalledWith(null)
        expect(discardDocument).toHaveBeenCalledOnce()
        expect(closeBoardDocument).toHaveBeenCalledOnce()
        expect(openFilesService.findDocument(card)).toBeNull()
        expect(card.content).toBe('# Card\n\nOriginal body')
    })

    it('commits a dirty body before close and restores its draft when reopened', async () => {
        const editedMarkdown = '# Card\n\nEdited before close'
        const updateCardBody = vi.spyOn(dataService.cards, 'updateCardBody').mockImplementation(() => card)
        const setBoardDocument = vi.spyOn(CardMarkdownDataSource.prototype, 'setBoardDocument')
        const discardDocument = vi.spyOn(MarkdownDocumentHistoryStore.prototype, 'discardDocument')
        const closeBoardDocument = vi.spyOn(openFilesService, 'closeBoardDocument')
        openPopover()
        const view = renderPopover()
        fireEvent.change(markdownTextbox(), { target: { value: editedMarkdown } })

        fireEvent.click(screen.getByRole('button', { name: 'Close card details' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(updateCardBody).toHaveBeenCalledWith(card.path, editedMarkdown, expect.any(Object))
        expect(updateCardBody.mock.invocationCallOrder[0]).toBeLessThan(closeBoardDocument.mock.invocationCallOrder[0])
        expect(setBoardDocument).toHaveBeenCalledWith(null)
        expect(discardDocument).toHaveBeenCalledOnce()
        expect(closeBoardDocument).toHaveBeenCalledOnce()

        openPopover()
        view.rerender(
            <AppThemeProvider>
                <CardBodyPopover
                    cardTypes={DEFAULT_CARD_TYPES}
                    isMobile={false}
                    onDeleteCard={vi.fn(async () => undefined)}
                    onOpenAffects={vi.fn()}
                    onOpenInFileMode={vi.fn()}
                    states={states}
                    statusColors={new Map()}
                    visible
                />
            </AppThemeProvider>,
        )

        await waitFor(() => expect(markdownTextbox()).toHaveValue(editedMarkdown))
    })
})
