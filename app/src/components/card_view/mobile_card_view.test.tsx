import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CARD_TYPES, type ProjectCard } from '../../data/data_types'
import { actionService } from '../../services/actions/action_service'
import { cardActionPopupService } from '../../services/actions/card_action_popup_service'
import { dataService } from '../../services/data/data_service'
import { openFilesService } from '../../services/open_files_service'
import { mobileCardViewService } from '../../services/project/mobile_card_view_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { cardDragDropService } from './card_drag_drop_service'
import { MobileCardView } from './mobile_card_view'

function card(id: string, title: string, status: string): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: `# ${title}\n\nBody of ${id}`,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id, internalId: id.toLowerCase(), owner: null,
            policy: {}, status, title, worktree: null, worktreeError: null, worktreeValue: null,
        },
        headerFields: { id, status, title },
        isActive: true,
        path: `design/${id}.md`,
    }
}

const cards = [card('F-1', 'First', 'todo'), card('F-2', 'Second', 'done')]

function renderMobileCardView() {
    vi.mocked(dataService.getState).mockReturnValue({
        project: { branch: 'main', id: 'project', rootPath: 'C:\\project' },
        runningAgents: [],
        snapshot: { activeCards: cards, backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
    })

    return render(
        <AppThemeProvider>
            <MobileCardView
                cardTypes={DEFAULT_CARD_TYPES}
                states={[
                    { alwaysVisible: false, state: 'todo' },
                    { alwaysVisible: false, state: 'done' },
                ]}
                statusColors={new Map([['todo', '#111111'], ['done', '#222222']])}
            />
        </AppThemeProvider>,
    )
}

function touch(identifier: number, clientX: number, clientY: number) {
    return { clientX, clientY, identifier, target: document.body }
}

describe('MobileCardView', () => {
    beforeEach(() => {
        workspaceViewService.setViewMode('cards')
        mobileCardViewService.selectVisibleColumn([])
        cardDragDropService.endDrag()
        cardActionPopupService.clear()
        vi.spyOn(dataService, 'getState')
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
        cardActionPopupService.clear()
        mobileCardViewService.selectVisibleColumn([])
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

    it('opens action popup from Run without opening card body', () => {
        const toggle = vi.spyOn(cardActionPopupService, 'toggle')
        actionService.loadFromFiles([{
            content: JSON.stringify({ command: 'npm test', description: 'Test', id: 'test', label: 'Test', type: 'command' }),
            path: 'actions/test.json',
        }])
        renderMobileCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        expect(toggle).toHaveBeenCalledOnce()
        expect(cardActionPopupService.getSnapshot()).toHaveLength(1)
        expect(screen.getByRole('dialog', { name: 'Run actions for F-1' })).toBeInTheDocument()
        expect(screen.queryByDisplayValue(/Body of F-1/u)).not.toBeInTheDocument()
    })
})
