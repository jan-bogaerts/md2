import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type Card } from '../../data/data_types'
import { actionService } from '../../services/actions/action_service'
import { cardPopupService } from '../../services/card_popup_service'
import {
    CARD_CHANGED_EVENT,
    cardCollectionFieldChangedEvent,
    cardFieldChangedEvent,
    dataService,
} from '../../services/data/data_service'
import { openFilesService } from '../../services/open_files_service'
import { mobileCardViewService } from '../../services/project/mobile_card_view_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { CardActionPopupHost } from '../actions/run/popup/card_action_popup_host'
import { cardDragDropService } from './card_drag_drop_service'
import { MobileCardView } from './mobile_card_view'

function card(id: string, title: string, status: string): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: `# ${title}\n\nBody of ${id}`,
        header: {
            affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id, internalId: id.toLowerCase(), owner: null,
            policy: {}, references: [], status, title, worktree: null, worktreeError: null, worktreeValue: null,
        },
        hasFrontmatter:true,
        isActive: true,
        path: `design/${id}.md`,
    }
}

const cards = [card('F-1', 'First', 'todo'), card('F-2', 'Second', 'done')]
let activeCards = cards

function setActiveCards(cardsToPublish: Card[]) {
    activeCards = cardsToPublish
    vi.mocked(dataService.getState).mockReturnValue({
        project: { branch: 'main', id: 'project', rootPath: 'C:\\project' },
        runningAgents: [],
        snapshot: { activeCards, backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
    })
}

function publishRemoteStatusChange(path: string, status: string) {
    const previousCard = activeCards.find((candidate) => candidate.path === path)
    if (!previousCard) throw new Error(`Cannot change missing card status: ${path}`)

    const changedCard = { ...previousCard, header: { ...previousCard.header, status } }
    setActiveCards(activeCards.map((candidate) => candidate.path === path ? changedCard : candidate))
    dataService.dispatchEvent(new CustomEvent(CARD_CHANGED_EVENT, { detail: { card: changedCard, previousCard } }))
    dataService.dispatchEvent(new Event(cardFieldChangedEvent(path, 'ordering')))
    dataService.dispatchEvent(new Event(cardCollectionFieldChangedEvent('ordering')))
    dataService.dispatchEvent(new Event(cardFieldChangedEvent(path, 'status')))
    dataService.dispatchEvent(new Event(cardCollectionFieldChangedEvent('status')))
}

function renderMobileCardView() {
    setActiveCards(activeCards)

    return render(
        <AppThemeProvider>
            <>
                <MobileCardView
                    cardTypes={DEFAULT_CARD_TYPES}
                    states={[
                        { alwaysVisible: false, state: 'todo' },
                        { alwaysVisible: false, state: 'done' },
                    ]}
                    statusColors={new Map([['todo', '#111111'], ['done', '#222222']])}
                />
                <CardActionPopupHost />
            </>
        </AppThemeProvider>,
    )
}

function touch(identifier: number, clientX: number, clientY: number) {
    return { clientX, clientY, identifier, target: document.body }
}

describe('MobileCardView', () => {
    beforeEach(() => {
        activeCards = cards
        workspaceViewService.setViewMode('cards')
        mobileCardViewService.selectVisibleColumn([])
        cardDragDropService.endDrag()
        cardPopupService.clear()
        vi.spyOn(dataService, 'getState')
        setActiveCards(activeCards)
        openFilesService.init({ actionService, dataService })
        cardMarkdownDataSource.init(dataService)
        vi.spyOn(dataService.cards, 'deleteCard').mockResolvedValue(null)
        vi.spyOn(dataService.cards, 'moveCard').mockResolvedValue([])
        vi.spyOn(dataService.cards, 'toggleCardPolicy').mockReturnValue(cards[0])
        vi.spyOn(dataService.cards, 'updateCardAffects').mockReturnValue(cards[0])
        vi.spyOn(dataService.cards, 'updateCardTitle').mockResolvedValue(cards[0])
        vi.spyOn(dataService, 'hasPendingFile').mockReturnValue(false)
        vi.spyOn(openFilesService, 'openPath')
        vi.spyOn(cardMarkdownDataSource, 'getMarkdown').mockImplementation((target) => target.document.kind === 'card'
            ? target.document.getDraft().content
            : '')
        vi.spyOn(cardMarkdownDataSource, 'commit').mockReturnValue(true)
    })

    afterEach(() => {
        cleanup()
        if (vi.isFakeTimers()) vi.runOnlyPendingTimers()
        vi.useRealTimers()
        cardDragDropService.endDrag()
        cardPopupService.clear()
        mobileCardViewService.selectVisibleColumn([])
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        actionService.clear()
        vi.restoreAllMocks()
    })

    it('shows first visible column full-width and switches with service selection', () => {
        renderMobileCardView()

        expect(screen.getByLabelText('todo column')).toBeInTheDocument()
        expect(screen.queryByLabelText('done column')).not.toBeInTheDocument()
        expect(screen.getByLabelText('todo column')).toHaveStyle({ minWidth: '100%', maxWidth: '100%' })

        act(() => mobileCardViewService.selectColumn('done'))

        expect(screen.getByLabelText('done column')).toBeInTheDocument()
        expect(screen.queryByLabelText('todo column')).not.toBeInTheDocument()
    })

    it('moves a remotely changed card between mobile columns and updates its open status control without remounting', () => {
        renderMobileCardView()
        const board = screen.getByLabelText('Mobile card board')
        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        const cardDialog = within(screen.getByRole('dialog'))
        const stateSelector = cardDialog.getByRole('combobox', { name: 'Card state' })
        expect(stateSelector).toHaveTextContent('todo')
        fireEvent.click(cardDialog.getByRole('button', { name: 'Properties' }))
        const properties = within(screen.getByLabelText('Card properties'))
        expect(properties.getByText('todo')).toBeInTheDocument()

        act(() => publishRemoteStatusChange('design/F-1.md', 'done'))

        expect(screen.getByLabelText('Mobile card board')).toBe(board)
        expect(within(board).queryByLabelText('todo column')).not.toBeInTheDocument()
        expect(within(board).getByLabelText('done column')).toBeInTheDocument()
        expect(within(board).getByRole('button', { hidden: true, name: 'Drag F-1' })).toBeInTheDocument()
        expect(stateSelector).toHaveTextContent('done')
        expect(properties.getByText('done')).toBeInTheDocument()
    })

    it('keeps vertical touch gestures native and does not open card actions', () => {
        vi.useFakeTimers()
        renderMobileCardView()
        const dragButton = screen.getByRole('button', { name: 'Drag F-1' })
        const startTouch = touch(1, 20, 100)
        const movedTouch = touch(1, 20, 70)

        expect(dragButton).toHaveStyle({ touchAction: 'pan-y' })
        expect(screen.getByLabelText('Mobile card board')).toHaveStyle({ overflowY: 'auto' })
        fireEvent.touchStart(dragButton, { changedTouches: [startTouch], touches: [startTouch] })
        fireEvent.touchMove(dragButton, { changedTouches: [movedTouch], touches: [movedTouch] })
        fireEvent.contextMenu(dragButton)
        act(() => vi.advanceTimersByTime(500))

        expect(cardDragDropService.getOverlaySnapshot().cardPath).toBeNull()
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('starts drag after long press and restores idle state on release and cancellation', () => {
        vi.useFakeTimers()
        renderMobileCardView()
        const dragButton = screen.getByRole('button', { name: 'Drag F-1' })
        const startTouch = touch(1, 20, 100)

        fireEvent.touchStart(dragButton, { changedTouches: [startTouch], touches: [startTouch] })
        act(() => vi.advanceTimersByTime(500))
        expect(cardDragDropService.getOverlaySnapshot().cardPath).toBe('design/F-1.md')
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()

        fireEvent.touchEnd(dragButton, { changedTouches: [startTouch], touches: [] })
        expect(cardDragDropService.getOverlaySnapshot().cardPath).toBeNull()

        const nextTouch = touch(2, 20, 100)
        fireEvent.touchStart(dragButton, { changedTouches: [nextTouch], touches: [nextTouch] })
        act(() => vi.advanceTimersByTime(500))
        expect(cardDragDropService.getOverlaySnapshot().cardPath).toBe('design/F-1.md')

        fireEvent.touchCancel(dragButton, { changedTouches: [nextTouch], touches: [] })
        expect(cardDragDropService.getOverlaySnapshot().cardPath).toBeNull()
    })

    it('archives a card from the mobile card actions menu after confirmation', async () => {
        renderMobileCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        const menuItems = screen.getAllByRole('menuitem').map((item) => item.textContent)
        expect(menuItems.slice(-2)).toEqual(['Archive', 'Delete'])

        fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Archive card' })).getByRole('button', { name: 'Archive' }))

        await waitFor(() => expect(dataService.cards.moveCard).toHaveBeenCalledWith('design/F-1.md', 'archived', 0))
    })

    it('opens action popup from Run without opening card body', () => {
        const toggle = vi.spyOn(cardPopupService, 'toggleAction')
        actionService.loadFromFiles([{
            content: JSON.stringify({ command: 'npm test', description: 'Test', id: 'test', label: 'Test', type: 'command' }),
            path: 'actions/test.json',
        }])
        renderMobileCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        expect(toggle).toHaveBeenCalledOnce()
        expect(cardPopupService.getSnapshot()).toHaveLength(1)
        expect(screen.getByRole('dialog', { name: 'Run actions for F-1' })).toBeInTheDocument()
        expect(screen.queryByDisplayValue(/Body of F-1/u)).not.toBeInTheDocument()
    })
})
