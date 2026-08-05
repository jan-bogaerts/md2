import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { DndContextProps, DragEndEvent } from '@dnd-kit/core'
import { createRef, Profiler } from 'react'
import type { ProfilerOnRenderCallback } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardView } from './card_view'
import { CardColumn } from './card_column'
import * as cardColumnModule from './card_column'
import { actionService } from '../../services/actions/action_service'
import type { ActionFile } from '../../data/action_types'
import { DEFAULT_CARD_TYPES, type CardTypeConfig, type ProjectCard } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { CARD_CHANGED_EVENT, dataService } from '../../services/data/data_service'
import { worktreeService } from '../../services/project/worktree_service'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { openFilesService } from '../../services/open_files_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { cardDragDropService } from './card_drag_drop_service'

const dragContextHandlers = vi.hoisted(() => ({
    onDragCancel: null as DndContextProps['onDragCancel'] | null,
    onDragEnd: null as DndContextProps['onDragEnd'] | null,
}))

vi.mock('@dnd-kit/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dnd-kit/core')>()
    const { createElement } = await import('react')

    return {
        ...actual,
        DndContext: (props: DndContextProps) => {
            dragContextHandlers.onDragCancel = props.onDragCancel ?? null
            dragContextHandlers.onDragEnd = props.onDragEnd ?? null

            return createElement(actual.DndContext, props)
        },
    }
})

function card(id: string, title: string, status: string, policy: Record<string, boolean> = {}): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        headerFields: { id, status, title },
        content: `# ${title}\n\nBody of ${id}`,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id, internalId: id.toLowerCase(), owner: null,
            policy, status, title,
            worktree: null, worktreeError: null, worktreeValue: null,
        },
        isActive: true,
        path: `design/${id}.md`,
    }
}

const cards = [
    card('F-1', 'First', 'todo', { checkLinting: true, requireTests: false }),
    card('F-2', 'Second', 'done'),
]

function setProjectCards(activeCards: ProjectCard[], repositoryFiles = ['app/src/app.tsx', 'design/F-1.md']) {
    vi.mocked(dataService.getState).mockReturnValue({
        project: { branch: 'main', id: 'project', rootPath: 'C:\\project' },
        runningAgents: [],
        snapshot: { activeCards, backgroundCards: [], repositoryFiles, workingFolder: 'design' },
    })
}

function actionFile(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

function createColumnHandlers() {
    return {
        onDeleteCard: vi.fn(async () => undefined),
        onOpenInFileMode: vi.fn(),
        onTitleChange: vi.fn(),
        onTogglePolicy: vi.fn(),
    }
}

function renderCardView(
    overrides: Partial<Parameters<typeof CardView>[0]> = {},
    activeCards = cards,
    repositoryFiles = ['app/src/app.tsx', 'design/F-1.md'],
    onRender?: ProfilerOnRenderCallback,
) {
    setProjectCards(activeCards, repositoryFiles)
    const scrollContainerRef = createRef<HTMLDivElement>()

    render(
        <AppThemeProvider>
            <div data-testid="mobile-scroll-container" ref={scrollContainerRef}>
                <Profiler id="card-view" onRender={onRender ?? (() => undefined)}>
                    <CardView
                        cardTypes={DEFAULT_CARD_TYPES}
                        isMobile={false}
                        scrollContainerRef={scrollContainerRef}
                        states={[
                            { alwaysVisible: false, state: 'todo' },
                            { alwaysVisible: false, state: 'done' },
                        ]}
                        statusColors={new Map([['todo', '#111111'], ['done', '#222222']])}
                        {...overrides}
                    />
                </Profiler>
            </div>
        </AppThemeProvider>,
    )
}

describe('CardView', () => {
    beforeEach(() => {
        dragContextHandlers.onDragCancel = null
        dragContextHandlers.onDragEnd = null
        workspaceViewService.setViewMode('cards')
        cardDragDropService.endDrag()
        vi.spyOn(dataService, 'getState')
        setProjectCards(cards)
        vi.spyOn(dataService.cards, 'deleteCard').mockResolvedValue(null)
        vi.spyOn(dataService.cards, 'moveCard').mockResolvedValue([])
        vi.spyOn(dataService.cards, 'toggleCardPolicy').mockReturnValue(cards[0])
        vi.spyOn(dataService.cards, 'updateCardAffects').mockReturnValue(cards[0])
        vi.spyOn(dataService.cards, 'updateCardTitle').mockResolvedValue(cards[0])
        vi.spyOn(openFilesService, 'openPath')
        vi.spyOn(dataService, 'hasPendingFile').mockReturnValue(false)
        vi.spyOn(cardMarkdownDataSource, 'getMarkdown').mockImplementation((target) => target.document.kind === 'card'
            ? target.document.getDraft().content
            : '')
        vi.spyOn(cardMarkdownDataSource, 'commit').mockReturnValue(true)
        vi.spyOn(cardMarkdownDataSource, 'updateActiveCardTitle').mockImplementation(() => undefined)
    })

    afterEach(() => {
        cleanup()
        cardDragDropService.endDrag()
        const { selectedPath } = workspaceViewService.getSnapshot()
        if (selectedPath) workspaceViewService.clearSelectedPath(selectedPath)
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        actionService.clear()
        vi.restoreAllMocks()
    })

    it('keeps hidden card columns mounted without occupying layout', () => {
        workspaceViewService.setViewMode('text')
        renderCardView()

        const cardColumns = screen.getByLabelText('Card columns')

        expect(cardColumns).not.toBeVisible()
        expect(cardColumns.parentElement).toHaveStyle({ display: 'none' })
    })

    it('switches visibility without rerendering card columns', () => {
        const renderCardColumn = vi.spyOn(cardColumnModule, 'CardColumn')
        renderCardView()
        const cardColumns = screen.getByLabelText('Card columns')
        renderCardColumn.mockClear()

        act(() => workspaceViewService.setViewMode('text'))
        act(() => workspaceViewService.setViewMode('cards'))

        expect(screen.getByLabelText('Card columns')).toBe(cardColumns)
        expect(renderCardColumn).not.toHaveBeenCalled()
    })

    it('groups cards into a column per status with id and title', () => {
        renderCardView()

        expect(screen.getByText('todo')).toBeInTheDocument()
        expect(screen.getByText('done')).toBeInTheDocument()
        expect(screen.getByText('F-1')).toBeInTheDocument()
        expect(screen.getByText('First')).toBeInTheDocument()
    })

    it('lets desktop columns flex between their minimum and maximum widths', () => {
        renderCardView()

        const columnStyle = window.getComputedStyle(screen.getByLabelText('todo column'))

        expect(columnStyle.flexGrow).toBe('1')
        expect(columnStyle.minWidth).toBe('200px')
        expect(columnStyle.maxWidth).toBe('320px')
    })

    it('renders both edge scroll zones only on mobile', () => {
        renderCardView()

        expect(screen.queryByTestId('left-card-scroll-zone')).not.toBeInTheDocument()
        expect(screen.queryByTestId('right-card-scroll-zone')).not.toBeInTheDocument()

        cleanup()
        renderCardView({ isMobile: true })

        expect(screen.getByTestId('left-card-scroll-zone')).toBeInTheDocument()
        expect(screen.getByTestId('right-card-scroll-zone')).toBeInTheDocument()
    })

    it('scrolls the mobile shell container from either edge and stops on pointer up', () => {
        renderCardView({ isMobile: true })
        const scrollContainer = screen.getByTestId('mobile-scroll-container')
        const leftZone = screen.getByTestId('left-card-scroll-zone')
        const rightZone = screen.getByTestId('right-card-scroll-zone')
        scrollContainer.scrollTop = 100

        fireEvent.pointerDown(leftZone, { clientY: 100, pointerId: 1 })
        fireEvent.pointerMove(leftZone, { clientY: 70, pointerId: 1 })
        expect(scrollContainer.scrollTop).toBe(130)

        fireEvent.pointerUp(leftZone, { pointerId: 1 })
        fireEvent.pointerMove(leftZone, { clientY: 40, pointerId: 1 })
        expect(scrollContainer.scrollTop).toBe(130)

        fireEvent.pointerDown(rightZone, { clientY: 50, pointerId: 2 })
        fireEvent.pointerMove(rightZone, { clientY: 80, pointerId: 2 })
        expect(scrollContainer.scrollTop).toBe(100)
    })

    it('stops edge scrolling on pointer cancellation and uses native scroll boundaries', () => {
        renderCardView({ isMobile: true })
        const scrollContainer = screen.getByTestId('mobile-scroll-container')
        const leftZone = screen.getByTestId('left-card-scroll-zone')
        const rightZone = screen.getByTestId('right-card-scroll-zone')
        let scrollTop = 0
        Object.defineProperty(scrollContainer, 'scrollTop', {
            configurable: true,
            get: () => scrollTop,
            set: (value: number) => {
                scrollTop = Math.max(0, Math.min(200, value))
            },
        })

        fireEvent.pointerDown(leftZone, { clientY: 100, pointerId: 1 })
        fireEvent.pointerMove(leftZone, { clientY: 130, pointerId: 1 })
        expect(scrollContainer.scrollTop).toBe(0)

        fireEvent.pointerCancel(leftZone, { pointerId: 1 })
        fireEvent.pointerMove(leftZone, { clientY: 70, pointerId: 1 })
        expect(scrollContainer.scrollTop).toBe(0)

        scrollContainer.scrollTop = 200
        fireEvent.pointerDown(rightZone, { clientY: 100, pointerId: 2 })
        fireEvent.pointerMove(rightZone, { clientY: 70, pointerId: 2 })
        expect(scrollContainer.scrollTop).toBe(200)
    })

    it('keeps edge gestures away from cards and preserves card interaction outside the zones', () => {
        renderCardView({ isMobile: true })
        const leftZone = screen.getByTestId('left-card-scroll-zone')

        fireEvent.pointerDown(leftZone, { clientY: 100, pointerId: 1 })
        fireEvent.pointerMove(leftZone, { clientY: 70, pointerId: 1 })
        fireEvent.pointerUp(leftZone, { pointerId: 1 })

        expect(cardDragDropService.getOverlaySnapshot().cardPath).toBeNull()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('shows always-visible columns without cards and hides other empty columns in config order', () => {
        renderCardView({
            states: [
                { alwaysVisible: true, state: 'new' },
                { alwaysVisible: false, state: 'design' },
                { alwaysVisible: true, state: 'done' },
            ],
        }, [])

        expect(screen.getByLabelText('new column')).toHaveTextContent('Drop a card here')
        expect(screen.getByLabelText('done column')).toHaveTextContent('Drop a card here')
        expect(screen.queryByText('design')).not.toBeInTheDocument()
    })

    it('inserts a card-sized drop position between target-column cards', () => {
        const handlers = createColumnHandlers()
        setProjectCards([card('F-1', 'First', 'done'), card('F-2', 'Second', 'done')])
        cardDragDropService.startDrag('design/F-1.md', 123, 235)
        cardDragDropService.setDropPreview({ targetIndex: 1, targetStatus: 'done' })
        render(
            <AppThemeProvider>
                <DndContext>
                    <CardColumn
                        cardTypes={DEFAULT_CARD_TYPES}
                        column={{ color: '#123456', status: 'done' }}
                        isMobile={false}
                        {...handlers}
                    />
                </DndContext>
            </AppThemeProvider>,
        )

        const firstCard = screen.getByRole('button', { name: 'Drag F-1' })
        const secondCard = screen.getByRole('button', { name: 'Drag F-2' })
        const dropPosition = screen.getByLabelText('Card drop position')
        const endDropTarget = screen.getByLabelText('done column end drop target')
        expect(firstCard.compareDocumentPosition(dropPosition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(dropPosition.compareDocumentPosition(secondCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(secondCard.compareDocumentPosition(endDropTarget) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(dropPosition).toHaveStyle({ minHeight: '123px' })
    })

    it('shows ids above titles without card type footnotes or an affects control', () => {
        const customCardTypes: CardTypeConfig[] = [
            ...DEFAULT_CARD_TYPES,
            { color: '#123456', idPrefix: 'R', label: 'Research', type: 'research' },
        ]
        renderCardView({ cardTypes: customCardTypes }, [
            card('F-012', 'Feature card', 'todo'),
            card('B-003', 'Bug card', 'todo'),
            card('X-001', 'Unknown card', 'todo'),
            card('R-007', 'Research card', 'todo'),
        ])

        const id = screen.getByText('F-012')
        const title = screen.getByText('Feature card')

        expect(id.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(screen.queryByText('Feature')).not.toBeInTheDocument()
        expect(screen.queryByText('Bug')).not.toBeInTheDocument()
        expect(screen.queryByText('Research')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Affects' })).not.toBeInTheDocument()
    })

    it('uses an empty transparent full-card button as the drag surface', () => {
        renderCardView()

        const dragButton = screen.getByRole('button', { name: 'Drag F-1' })

        expect(dragButton).toBeEmptyDOMElement()
        expect(dragButton).toHaveStyle({ backgroundColor: 'rgba(0, 0, 0, 0)', inset: '0', position: 'absolute' })
    })

    it('renders one policy led per policy flag and toggles on click', () => {
        renderCardView()
        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        const checkLintingButton = screen.getByRole('menuitem', { name: 'Toggle checkLinting' })

        expect(checkLintingButton).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(checkLintingButton)

        expect(dataService.cards.toggleCardPolicy).toHaveBeenCalledWith('design/F-1.md', 'checkLinting')
    })

    it('edits the title from the card actions and commits on Enter', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Edit title' }))
        const input = screen.getByDisplayValue('First')
        fireEvent.change(input, { target: { value: 'Renamed' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        expect(dataService.cards.updateCardTitle).toHaveBeenCalledWith('design/F-1.md', 'Renamed')
    })

    it('opens the body in a card-relative popup on desktop when the card surface is clicked', () => {
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByText('F-1')).toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', { name: 'Card title' })).toHaveValue('First')
        expect(within(dialog).getByDisplayValue(/Body of F-1/)).toBeInTheDocument()
        expect(within(dialog).getByTestId('block-type-select')).toBeInTheDocument()
        expect(within(dialog).getByTestId('insert-code-block')).toBeInTheDocument()
        expect(within(dialog).getByTestId('mdx-editor-overlay')).toBeInTheDocument()
        expect(within(dialog).getByText('tokens: 0')).toBeInTheDocument()
        expect(trackEvent).toHaveBeenCalledWith('navigation')

        trackEvent.mockRestore()
    })

    it('does not rerender card columns when the body popup opens or closes', () => {
        const renderCardColumn = vi.spyOn(cardColumnModule, 'CardColumn')
        renderCardView()
        const initialRenderCount = renderCardColumn.mock.calls.length

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        expect(renderCardColumn).toHaveBeenCalledTimes(initialRenderCount)

        fireEvent.click(screen.getByRole('button', { name: 'Close card details' }))
        expect(renderCardColumn).toHaveBeenCalledTimes(initialRenderCount)
    })

    it('rerenders only columns whose drop preview changes', () => {
        const renderCardColumn = vi.spyOn(cardColumnModule, 'CardColumn')
        renderCardView()
        const initialRenderCount = renderCardColumn.mock.calls.length
        cardDragDropService.startDrag('design/F-1.md', 107, 235)

        act(() => cardDragDropService.setDropPreview({ targetIndex: 0, targetStatus: 'done' }))

        expect(renderCardColumn).toHaveBeenCalledTimes(initialRenderCount + 1)
        expect(renderCardColumn.mock.calls.at(-1)?.[0].column.status).toBe('done')

        act(() => cardDragDropService.setDropPreview({ targetIndex: 0, targetStatus: 'done' }))

        expect(renderCardColumn).toHaveBeenCalledTimes(initialRenderCount + 1)

        act(() => cardDragDropService.setDropPreview({ targetIndex: 0, targetStatus: 'todo' }))

        expect(renderCardColumn).toHaveBeenCalledTimes(initialRenderCount + 3)
        expect(renderCardColumn.mock.calls.slice(-2).map(([props]) => props.column.status))
            .toEqual(expect.arrayContaining(['done', 'todo']))
    })

    it('commits a cross-column drop without an intermediate destination render', () => {
        const renderCardColumn = vi.spyOn(cardColumnModule, 'CardColumn')
        let activeCards = cards
        const destinationSnapshots: Array<{ hasPreview: boolean, text: string }> = []
        const previewCleanupCards: string[][] = []
        vi.mocked(dataService.cards.moveCard).mockImplementation(async () => {
            const previousCard = activeCards[0]
            const movedCard = {
                ...previousCard,
                header: { ...previousCard.header, after: activeCards[1].header.internalId, status: 'done' },
                headerFields: { ...previousCard.headerFields, status: 'done' },
            }
            activeCards = [movedCard, activeCards[1]]
            setProjectCards(activeCards)
            dataService.dispatchEvent(new CustomEvent(CARD_CHANGED_EVENT, { detail: { card: movedCard, previousCard } }))

            return []
        })
        const captureDestination = () => {
            const destination = screen.queryByLabelText('done column')
            if (destination) destinationSnapshots.push({
                hasPreview: !!within(destination).queryByLabelText('Card drop position'),
                text: destination.textContent ?? '',
            })
        }
        renderCardView({}, activeCards, undefined, captureDestination)
        act(() => {
            cardDragDropService.startDrag('design/F-1.md', 107, 235)
            cardDragDropService.setDropPreview({ targetIndex: 1, targetStatus: 'done' })
        })
        const unsubscribe = cardDragDropService.subscribeColumn('done', () => {
            previewCleanupCards.push(activeCards.filter(({ header }) => header.status === 'done').map(({ path }) => path))
        })
        destinationSnapshots.length = 0
        renderCardColumn.mockClear()

        act(() => dragContextHandlers.onDragEnd?.({
            active: { id: 'design/F-1.md' },
            over: { id: 'column:done' },
        } as DragEndEvent))
        unsubscribe()

        const destinationRenders = renderCardColumn.mock.calls.filter(([props]) => props.column.status === 'done')
        expect(destinationRenders).toHaveLength(1)
        expect(destinationSnapshots.length).toBeGreaterThan(0)
        expect(destinationSnapshots).toEqual(destinationSnapshots.map(({ text }) => ({ hasPreview: false, text })))
        expect(destinationSnapshots.at(-1)?.text).toContain('Second')
        expect(destinationSnapshots.at(-1)?.text).toContain('First')
        expect(previewCleanupCards).toEqual([['design/F-1.md', 'design/F-2.md']])
        expect(screen.queryByLabelText('todo column')).not.toBeInTheDocument()
        const destination = within(screen.getByLabelText('done column'))
        const movedCard = destination.getByRole('button', { name: 'Drag F-1' })
        const previousCard = destination.getByRole('button', { name: 'Drag F-2' })
        expect(previousCard.compareDocumentPosition(movedCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(destination.getAllByRole('button', { name: /^Drag /u })).toHaveLength(2)
        expect(cardDragDropService.getOverlaySnapshot().cardPath).toBeNull()
    })

    it('commits a same-column reorder without an intermediate destination render', () => {
        const renderCardColumn = vi.spyOn(cardColumnModule, 'CardColumn')
        const firstCard = card('F-1', 'First', 'done')
        const secondCard = card('F-2', 'Second', 'done')
        let activeCards = [firstCard, secondCard]
        const destinationSnapshots: string[] = []
        const overlayCleanupCards: string[][] = []
        vi.mocked(dataService.cards.moveCard).mockImplementation(async () => {
            const movedFirstCard = {
                ...firstCard,
                header: { ...firstCard.header, after: secondCard.header.internalId },
            }
            activeCards = [secondCard, movedFirstCard]
            setProjectCards(activeCards)
            dataService.dispatchEvent(new CustomEvent(CARD_CHANGED_EVENT, {detail: { card: movedFirstCard, previousCard: firstCard }}))

            return []
        })
        const captureDestination = () => {
            const destination = screen.queryByLabelText('done column')
            if (destination) destinationSnapshots.push(destination.textContent ?? '')
        }
        renderCardView({}, activeCards, undefined, captureDestination)
        act(() => cardDragDropService.startDrag('design/F-1.md', 107, 235))
        const unsubscribe = cardDragDropService.subscribeOverlay(() => {
            overlayCleanupCards.push(activeCards.map(({ path }) => path))
        })
        destinationSnapshots.length = 0
        renderCardColumn.mockClear()

        act(() => dragContextHandlers.onDragEnd?.({
            active: { id: 'design/F-1.md' },
            over: { id: 'column:done' },
        } as DragEndEvent))
        unsubscribe()

        const destinationRenders = renderCardColumn.mock.calls.filter(([props]) => props.column.status === 'done')
        expect(destinationRenders).toHaveLength(1)
        expect(destinationSnapshots.length).toBeGreaterThan(0)
        expect(overlayCleanupCards).toEqual([['design/F-2.md', 'design/F-1.md']])
        const first = screen.getByRole('button', { name: 'Drag F-1' })
        const second = screen.getByRole('button', { name: 'Drag F-2' })
        expect(second.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(within(screen.getByLabelText('done column')).getByText('2')).toBeInTheDocument()
        expect(cardDragDropService.getOverlaySnapshot().cardPath).toBeNull()
    })

    it('keeps invalid drops and cancellation as cleanup-only paths', () => {
        renderCardView()
        act(() => cardDragDropService.startDrag('design/F-1.md', 107, 235))

        act(() => dragContextHandlers.onDragEnd?.({
            active: { id: 'design/F-1.md' },
            over: { id: 'design/F-1.md' },
        } as DragEndEvent))

        expect(dataService.cards.moveCard).not.toHaveBeenCalled()
        expect(cardDragDropService.getOverlaySnapshot().cardPath).toBeNull()

        act(() => cardDragDropService.startDrag('design/F-1.md', 107, 235))
        act(() => dragContextHandlers.onDragCancel?.({} as Parameters<NonNullable<DndContextProps['onDragCancel']>>[0]))

        expect(dataService.cards.moveCard).not.toHaveBeenCalled()
        expect(cardDragDropService.getOverlaySnapshot().cardPath).toBeNull()
    })

    it('routes the file-mode action from the popup to the callback', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        fireEvent.click(screen.getByRole('button', { name: 'Open in file mode' }))

        expect(openFilesService.openPath).toHaveBeenCalledWith('design/F-1.md')
    })

    it('edits the title from the card popup and commits on Enter', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        const titleInput = within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Card title' })
        fireEvent.change(titleInput, { target: { value: 'Renamed in popup' } })
        fireEvent.keyDown(titleInput, { key: 'Enter' })

        expect(cardMarkdownDataSource.updateActiveCardTitle)
            .toHaveBeenCalledWith('board-card', 'Renamed in popup')
    })

    it('opens card Properties from the board popup toolbar', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        const cardDialog = within(screen.getByRole('dialog'))
        const propertiesButton = cardDialog.getByRole('button', { name: 'Properties' })
        expect(propertiesButton).toHaveTextContent('')
        fireEvent.click(propertiesButton)

        const propertiesPopup = within(screen.getByRole('dialog', { name: 'Card properties popup' }))
        expect(propertiesPopup.getByRole('heading', { name: 'Properties' })).toBeInTheDocument()
        expect(propertiesPopup.getByLabelText('Card type')).toBeInTheDocument()
    })

    it('expands and restores the card popup from the formatting toolbar', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fullscreen' }))

        expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument()
    })

    it('shows dirty immediately when the card body is edited', () => {
        const cardWithTrailingNewline = { ...cards[0], content: `${cards[0].content}\n` }
        renderCardView({}, [cardWithTrailingNewline])

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        expect(within(screen.getByRole('dialog')).getByText('Saved')).toBeInTheDocument()

        fireEvent.change(within(screen.getByRole('dialog')).getByDisplayValue(/Body of F-1/u), {target: { value: 'Edited body' }})

        expect(within(screen.getByRole('dialog')).getByText('Dirty')).toBeInTheDocument()
    })

    it('shows saved only after the canonical document revision is acknowledged', () => {
        renderCardView()
        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        const document = openFilesService.findDocument(cards[0])
        if (!document || document.kind !== 'card') throw new Error('Missing open card document')

        act(() => document.updateDraft({ ...document.getDraft(), content: 'Edited' }))
        expect(within(screen.getByRole('dialog')).getByText('Dirty')).toBeInTheDocument()

        act(() => document.createSaveReference().acknowledge())
        expect(within(screen.getByRole('dialog')).getByText('Saved')).toBeInTheDocument()
    })

    it('routes the file-mode action from the card header without opening the popup', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Open F-1 in file mode' }))

        expect(openFilesService.openPath).toHaveBeenCalledWith('design/F-1.md')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('confirms before deleting from the card actions menu', async () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
        const dialog = screen.getByRole('dialog', { name: 'Delete card' })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

        await waitFor(() => expect(dataService.cards.deleteCard).toHaveBeenCalledWith('design/F-1.md'))
    })

    it('does not delete from the card actions menu when confirmation is cancelled', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
        const dialog = screen.getByRole('dialog', { name: 'Delete card' })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

        expect(dataService.cards.deleteCard).not.toHaveBeenCalled()
    })

    it('shows only Run inline and opens matching actions from the card context menu', () => {
        actionService.loadFromFiles([
            actionFile({
                appliesTo: { type: 'feature' },
                description: 'Implement',
                id: 'action-implement',
                label: 'Implement',
                prompt: 't',
                type: 'agent',
            }),
        ])
        renderCardView()

        expect(screen.getAllByRole('button', { name: 'Run' })).toHaveLength(cards.length)
        expect(screen.queryByRole('button', { name: 'Implement' })).not.toBeInTheDocument()

        fireEvent.contextMenu(screen.getByText('First'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Implement' }))

        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))
        expect(dialog.getByRole('button', { name: 'Implement' })).toHaveAttribute('aria-pressed', 'true')
        expect(dialog.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    })

    it('opens existing card commands from the icon button menu', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Open in file mode' }))

        expect(openFilesService.openPath).toHaveBeenCalledWith('design/F-1.md')
    })

    it('confirms before deleting from the body popup', async () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
        const confirmDialog = screen.getByRole('dialog', { name: 'Delete card' })
        fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }))

        await waitFor(() => expect(dataService.cards.deleteCard).toHaveBeenCalledWith('design/F-1.md'))
    })

    it('opens a viewport-sized card popup with mobile actions', () => {
        renderCardView({ isMobile: true })

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))

        const dialog = screen.getByRole('dialog')
        const affectsButton = within(dialog).getByRole('button', { name: 'Affects' })
        expect(within(dialog).getByDisplayValue(/Body of F-1/)).toBeInTheDocument()
        expect(dialog).toHaveStyle({
            borderRadius: 0,
            height: '100vh',
            left: 0,
            margin: 0,
            top: 0,
            width: '100vw',
        })
        expect(affectsButton).toHaveTextContent('')
        expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveTextContent('')
        expect(within(dialog).getByRole('button', { name: 'Open in file mode' })).toHaveTextContent('')
        expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument()
        expect(within(dialog).queryByRole('button', { name: 'Fullscreen' })).not.toBeInTheDocument()
        expect(screen.queryByRole('separator', { name: /Resize card details popup/u })).not.toBeInTheDocument()
    })

    it('keeps desktop popup sizing, actions, resizing, and fullscreen control', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveStyle({ height: '620px', width: '760px' })
        expect(within(dialog).getByRole('button', { name: 'Delete' })).toHaveTextContent('Delete')
        expect(within(dialog).getByRole('button', { name: 'Affects' })).toHaveTextContent('Affects')
        expect(within(dialog).getByRole('button', { name: 'Open in file mode' })).toHaveTextContent('Open in file mode')
        expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument()
        expect(screen.getByRole('separator', { name: 'Resize card details popup from right' })).toBeInTheDocument()
    })

    it('highlights the card matching the selected path', () => {
        workspaceViewService.selectPath('design/F-2.md')
        const { container } = render(
            <AppThemeProvider>
                <CardView
                    cardTypes={DEFAULT_CARD_TYPES}
                    isMobile={false}
                    scrollContainerRef={createRef<HTMLDivElement>()}
                    states={[
                        { alwaysVisible: false, state: 'todo' },
                        { alwaysVisible: false, state: 'done' },
                    ]}
                    statusColors={new Map([['todo', '#111111'], ['done', '#222222']])}
                />
            </AppThemeProvider>,
        )

        const selected = container.querySelectorAll('[data-selected="true"]')
        expect(selected).toHaveLength(1)
        expect(within(selected[0] as HTMLElement).getByText('Second')).toBeInTheDocument()
    })

    it('removes board conversation controls and assigns the primary worktree', () => {
        const setCardWorktree = vi.spyOn(worktreeService, 'setCardWorktree').mockResolvedValue(undefined)
        renderCardView()

        expect(screen.queryByRole('button', { name: /Agent conversations/u })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /F-1: C:.*project/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Primary — C:.*project/u }))

        expect(setCardWorktree).toHaveBeenCalledWith('design/F-1.md', null)
    })

    it('shows the affects control in the card popup and saves changes', () => {
        renderCardView()

        expect(screen.queryByRole('button', { name: 'Affects' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Affects' }))
        fireEvent.change(screen.getByRole('combobox', { name: 'Add affected file' }), { target: { value: 'app/src/app.tsx' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(dataService.cards.updateCardAffects).toHaveBeenCalledWith('design/F-1.md', ['app/src/app.tsx'])
    })
})
