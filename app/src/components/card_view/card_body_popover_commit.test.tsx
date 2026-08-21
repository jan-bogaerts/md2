import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type Card, type WorktreeRecord } from '../../data/data_types'
import { openFilesService } from '../../services/open_files_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CARD_BODY_POPOVER_SIZE_KEY, CardBodyPopover } from './card_body_popover'
import { cardCollectionFieldChangedEvent, dataService } from '../../services/data/data_service'
import { cardPopupService } from '../../services/card_popup_service'
import { worktreeService } from '../../services/project/worktree_service'
import { actionService } from '../../services/actions/action_service'
import { CardMarkdownDataSource } from '../editor/card_markdown_data_source'

vi.mock('../hooks/use_card_commits', () => ({
    useCardCommits: () => ({
        commits: [{
            branch: 'main',
            commit: 'a'.repeat(40),
            committedAt: '2026-07-20T10:00:00.000Z',
            deletions: 1,
            filePaths: ['design/F-060.md'],
            filesChanged: 1,
            insertions: 2,
            record: {
                commits: [],
                completedAt: '2026-07-20T10:00:00.000Z',
                conversationIds: [],
                runId: 'run-1',
                details: { command: 'edit', output: '', type: 'command' },
                origin: { cardInternalId: 'card-060', kind: 'card' },
                rootActionId: 'implement',
                rootActionLabel: 'Implement',
                startedAt: '2026-07-20T10:00:00.000Z',
                status: 'completed',
            },
        }],
        error: null,
    }),
}))

vi.mock('./card_commit_diff_panel', () => ({
    CardCommitDiffPanel: ({ selection }: { selection: { kind: string } }) => (
        <div aria-label={selection.kind === 'worktree' ? 'Card worktree diff' : 'Card commit diff'} />
    ),
}))

vi.mock('./card_body_save_status', () => ({ CardBodySaveStatus: () => null }))
vi.mock('./card_body_editor', () => ({ CardBodyEditor: () => <div aria-label="Live card editor" /> }))

const card: Card = {
    agentConversationErrors: [],
    agentConversations: [],
    content: '# Card\n\nBody',
    header: {
        affects: [], after: null, agentLogReferences: [], author: null, id: 'F-060', internalId: 'card-060',
        owner: null, policy: {}, references: [], status: 'ready', title: 'Card', worktree: null, worktreeError: null, worktreeValue: null,
    },
    hasFrontmatter:true,
    isActive: true,
    path: 'design/F-060.md',
}

const secondCard: Card = {
    ...card,
    header: { ...card.header, id: 'F-061', internalId: 'card-061', title: 'Second card' },
    path: 'design/F-061.md',
}

const states = [{ alwaysVisible: true, state: 'ready' }]

afterEach(() => {
    cleanup()
    cardPopupService.clear()
    window.localStorage.clear()
    vi.restoreAllMocks()
})

beforeEach(() => {
    vi.spyOn(dataService, 'getState').mockReturnValue({
        project: null,
        runningAgents: [],
        snapshot: { activeCards: [card], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
    })
})

describe('CardBodyPopover commit diff', () => {
    it('keeps separate documents and title drafts while entries activate and close', async () => {
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: null,
            runningAgents: [],
            snapshot: { activeCards: [card, secondCard], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
        const firstAnchor = document.body.appendChild(document.createElement('button'))
        const secondAnchor = document.body.appendChild(document.createElement('button'))
        const closeBoardDocument = vi.spyOn(openFilesService, 'closeBoardDocument')
        cardPopupService.toggleCardDetails(card.header.internalId!, firstAnchor)
        cardPopupService.toggleCardDetails(secondCard.header.internalId!, secondAnchor)
        const firstEntry = cardPopupService.getSnapshot()[0]

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
        const firstDialog = screen.getByRole('dialog', { name: 'F-060 card details' })
        const secondDialog = screen.getByRole('dialog', { name: 'F-061 card details' })
        const firstTitle = within(firstDialog).getByRole('textbox', { name: 'Card title' })
        fireEvent.change(firstTitle, { target: { value: 'First draft' } })

        fireEvent.pointerDown(firstDialog)

        expect(cardPopupService.getSnapshot().at(-1)?.id).toBe(firstEntry.id)
        expect(firstTitle).toHaveValue('First draft')
        expect(within(secondDialog).getByRole('textbox', { name: 'Card title' })).toHaveValue('Second card')

        fireEvent.click(within(firstDialog).getByRole('button', { name: 'Close card details' }))

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'F-060 card details' })).not.toBeInTheDocument())
        expect(screen.getByRole('dialog', { name: 'F-061 card details' })).toBeInTheDocument()
        expect(closeBoardDocument).toHaveBeenCalledOnce()
    })

    it('shows only highest mobile card-details entry and reveals next after close', async () => {
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: null,
            runningAgents: [],
            snapshot: { activeCards: [card, secondCard], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
        const firstAnchor = document.body.appendChild(document.createElement('button'))
        const secondAnchor = document.body.appendChild(document.createElement('button'))
        cardPopupService.toggleCardDetails(card.header.internalId!, firstAnchor)
        cardPopupService.toggleCardDetails(secondCard.header.internalId!, secondAnchor)

        render(
            <AppThemeProvider>
                <CardBodyPopover
                    cardTypes={DEFAULT_CARD_TYPES}
                    isMobile
                    onDeleteCard={vi.fn(async () => undefined)}
                    onOpenAffects={vi.fn()}
                    onOpenInFileMode={vi.fn()}
                    states={states}
                    statusColors={new Map()}
                    visible
                />
            </AppThemeProvider>,
        )

        expect(screen.queryByRole('dialog', { name: 'F-060 card details' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Close card details' }))

        await waitFor(() => expect(screen.getByRole('dialog', { name: 'F-060 card details' })).toBeInTheDocument())
        expect(screen.queryByRole('dialog', { name: 'F-061 card details' })).not.toBeInTheDocument()
    })

    it('uses dynamic viewport height and fixed mobile placement without desktop resizing or persistence', () => {
        const storedSize = JSON.stringify({ height: 700, width: 800 })
        window.localStorage.setItem(CARD_BODY_POPOVER_SIZE_KEY, storedSize)
        const getStoredValue = vi.spyOn(Storage.prototype, 'getItem')
        const setStoredValue = vi.spyOn(Storage.prototype, 'setItem')
        const anchorElement = document.body.appendChild(document.createElement('button'))
        cardPopupService.toggleCardDetails(card.header.internalId!, anchorElement)

        render(
            <AppThemeProvider>
                <CardBodyPopover
                    cardTypes={DEFAULT_CARD_TYPES}
                    isMobile
                    onDeleteCard={vi.fn(async () => undefined)}
                    onOpenAffects={vi.fn()}
                    onOpenInFileMode={vi.fn()}
                    states={states}
                    statusColors={new Map()}
                    visible
                />
            </AppThemeProvider>,
        )
        const dialog = screen.getByRole('dialog', { name: 'F-060 card details' })

        expect(dialog).toHaveStyle({
            borderRadius: '0px', height: '100dvh', left: '0px', margin: '0px', maxHeight: 'none', maxWidth: 'none',
            top: '0px', width: '100vw',
        })
        expect(dialog.querySelector('[data-drag-handle="true"]')).toBeNull()
        expect(within(dialog).queryByRole('separator', { name: /Resize card details popup/u })).not.toBeInTheDocument()
        expect(within(dialog).getByLabelText('Live card editor')).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Close card details' })).toBeInTheDocument()
        expect(getStoredValue).not.toHaveBeenCalledWith(CARD_BODY_POPOVER_SIZE_KEY)
        expect(setStoredValue).not.toHaveBeenCalledWith(CARD_BODY_POPOVER_SIZE_KEY, expect.any(String))
        expect(window.localStorage.getItem(CARD_BODY_POPOVER_SIZE_KEY)).toBe(storedSize)
    })

    it('uses persisted desktop size and exposes header drag plus eight resize directions', () => {
        window.localStorage.setItem(CARD_BODY_POPOVER_SIZE_KEY, JSON.stringify({ height: 700, width: 800 }))
        const anchorElement = document.body.appendChild(document.createElement('button'))
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
        const dialog = screen.getByRole('dialog', { name: 'F-060 card details' })

        expect(dialog).toHaveStyle({ height: '700px', width: '800px' })
        expect(dialog.querySelector('[data-drag-handle="true"]')).not.toBeNull()
        expect(within(dialog).getAllByRole('separator', { name: /Resize card details popup from/u })).toHaveLength(8)
    })

    it('keeps the board document bound when refreshed card data retains its identity', () => {
        const anchorElement = document.createElement('button')
        document.body.append(anchorElement)
        const openBoardDocument = vi.spyOn(openFilesService, 'openBoardDocument')
        const closeBoardDocument = vi.spyOn(openFilesService, 'closeBoardDocument')
        const props = {
            cardTypes: DEFAULT_CARD_TYPES,
            isMobile: false,
            onDeleteCard: vi.fn(async () => undefined),
            onOpenAffects: vi.fn(),
            onOpenInFileMode: vi.fn(),
            states,
            statusColors: new Map<string, string>(),
            visible: true,
        }
        cardPopupService.toggleCardDetails(card.header.internalId!, anchorElement)
        const view = render(
            <AppThemeProvider>
                <CardBodyPopover {...props} />
            </AppThemeProvider>,
        )

        view.rerender(
            <AppThemeProvider>
                <CardBodyPopover {...props} />
            </AppThemeProvider>,
        )

        expect(openBoardDocument).toHaveBeenCalledOnce()
        expect(closeBoardDocument).not.toHaveBeenCalled()
    })

    it('keeps clean card body bound while a title rename changes its path', async () => {
        const renamedCard = {
            ...card,
            content: '# Renamed card\n\nBody',
            header: { ...card.header, title: 'Renamed card' },
            path: 'design/F-060-renamed-card.md',
        }
        let activeCards = [card]
        vi.spyOn(dataService, 'getState').mockImplementation(() => ({
            project: null,
            runningAgents: [],
            snapshot: { activeCards, backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        }))
        openFilesService.init({ actionService, dataService })
        const anchorElement = document.body.appendChild(document.createElement('button'))
        const setBoardDocument = vi.spyOn(CardMarkdownDataSource.prototype, 'setBoardDocument')
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
        const cardDocument = openFilesService.findDocument(card)
        if (!cardDocument || cardDocument.kind !== 'card') throw new Error('Expected open card document')

        expect(cardDocument.dirty).toBe(false)
        expect(setBoardDocument).toHaveBeenCalledOnce()

        activeCards = [renamedCard]
        act(() => {
            dataService.dispatchEvent(new Event('changed'))
            dataService.dispatchEvent(new Event(cardCollectionFieldChangedEvent('identity')))
        })

        await waitFor(() => expect(screen.getByRole('dialog', { name: 'F-060 card details' })).toBeInTheDocument())
        expect(openFilesService.findDocument(renamedCard)).toBe(cardDocument)
        expect(cardDocument.path).toBe(renamedCard.path)
        expect(cardDocument.getDraft().content).toBe(renamedCard.content)
        expect(setBoardDocument).toHaveBeenCalledOnce()
        expect(setBoardDocument).not.toHaveBeenCalledWith(null)

        fireEvent.click(screen.getByRole('button', { name: 'Close card details' }))

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'F-060 card details' })).not.toBeInTheDocument())
        expect(setBoardDocument).toHaveBeenCalledWith(null)
        expect(openFilesService.findDocument(renamedCard)).toBeNull()
    })

    it('uses the first Escape to exit diff and the second to close the popover', () => {
        const anchorElement = document.createElement('button')
        document.body.append(anchorElement)
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

        fireEvent.click(screen.getByRole('button', { name: 'Card commit history' }))
        fireEvent.click(screen.getByRole('button', { name: /Implement/ }))
        expect(screen.getByLabelText('Card commit diff')).toBeInTheDocument()
        expect(screen.getByLabelText('Live card editor')).toBeInTheDocument()
        expect(screen.getByLabelText('Live card editor')).not.toBeVisible()
        const dialog = screen.getByRole('dialog')

        fireEvent.keyDown(dialog, { key: 'Escape' })
        expect(screen.queryByLabelText('Card commit diff')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Live card editor')).toBeVisible()
        expect(cardPopupService.getSnapshot()).toHaveLength(1)

        fireEvent.keyDown(dialog, { key: 'Escape' })
        expect(cardPopupService.getSnapshot()).toEqual([])
    })

    it('uses same worktree panel from menu action and popup entry, then removes it when eligibility is lost', async () => {
        const assignedCard = { ...card, header: { ...card.header, worktree: 1, worktreeValue: '1' } }
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: null,
            runningAgents: [],
            snapshot: { activeCards: [assignedCard], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
        let records: WorktreeRecord[] = [{
            branch: 'feature', error: null, parkingBranch: 'md2/parking/feature', path: 'C:/worktree',
            status: { ahead: 0, baseAhead: 1, baseBehind: 0, behind: 0, dirty: false, hasUpstream: false }, valid: true,
        }]
        vi.spyOn(worktreeService, 'getRecords').mockImplementation(() => records)
        const anchorElement = document.createElement('button')
        document.body.append(anchorElement)
        cardPopupService.openWorktreeDiff(assignedCard.header.internalId!, anchorElement)
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

        expect(screen.getByLabelText('Card worktree diff')).toBeInTheDocument()
        const entry = cardPopupService.getSnapshot()[0]
        cardPopupService.clearDiff(entry.id)
        fireEvent.click(screen.getByRole('button', { name: 'Card commit history' }))
        fireEvent.click(screen.getByRole('button', { name: /Current worktree changes/ }))
        expect(screen.getByLabelText('Card worktree diff')).toBeInTheDocument()

        records = [{ ...records[0], status: { ...records[0].status, baseAhead: 0 } }]
        worktreeService.dispatchEvent(new CustomEvent('changed'))

        await waitFor(() => expect(screen.queryByLabelText('Card worktree diff')).not.toBeInTheDocument())
        fireEvent.click(screen.getByRole('button', { name: 'Card commit history' }))
        expect(screen.queryByRole('button', { name: /Current worktree changes/ })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Implement/ })).toBeInTheDocument()
    })
})
