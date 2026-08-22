import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type Card } from '../../data/data_types'
import { actionService } from '../../services/actions/action_service'
import { cardPopupService } from '../../services/card_popup_service'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
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
    content: '# Card\n\nPersisted body',
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

describe('CardBodyPopover with installed MDXEditor', () => {
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
        vi.restoreAllMocks()
    })

    it('clears an active board target during ancestor passive cleanup before history detaches', async () => {
        const anchorElement = document.body.appendChild(document.createElement('button'))
        const setBoardDocument = vi.spyOn(CardMarkdownDataSource.prototype, 'setBoardDocument')
        const switchDocument = vi.spyOn(MarkdownDocumentHistoryStore.prototype, 'switchDocument')
        const discardDocument = vi.spyOn(MarkdownDocumentHistoryStore.prototype, 'discardDocument')
        const detachEditor = vi.spyOn(MarkdownDocumentHistoryStore.prototype, 'detachEditor')
        const closeBoardDocument = vi.spyOn(openFilesService, 'closeBoardDocument')
        const reportError = vi.spyOn(dialogService, 'error')
        cardPopupService.toggleCardDetails(card.header.internalId!, anchorElement)
        render(
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
        await waitFor(() => expect(document.querySelector('[contenteditable="true"]')?.textContent).toContain('Persisted body'))

        fireEvent.click(screen.getByRole('button', { name: 'Close card details' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        const clearCallIndex = setBoardDocument.mock.calls.findIndex(([documentTarget]) => documentTarget === null)
        const clearCallOrder = setBoardDocument.mock.invocationCallOrder[clearCallIndex]
        expect(clearCallIndex).toBeGreaterThanOrEqual(0)
        expect(switchDocument).toHaveBeenCalledWith(null, '', card.content, expect.any(Function))
        expect(clearCallOrder).toBeLessThan(discardDocument.mock.invocationCallOrder[0])
        expect(discardDocument.mock.invocationCallOrder[0]).toBeLessThan(closeBoardDocument.mock.invocationCallOrder[0])
        expect(clearCallOrder).toBeLessThan(detachEditor.mock.invocationCallOrder[0])
        expect(reportError.mock.calls.some(([error]) => (
            error instanceof Error && error.message === 'Cannot switch Markdown history before editor is attached'
        ))).toBe(false)
    })
})
