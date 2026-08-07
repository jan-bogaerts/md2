import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import type { DndContextProps } from '@dnd-kit/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardView } from './card_view'
import { CardColumn } from './card_column'
import * as cardColumnModule from './card_column'
import { actionService } from '../../services/actions/action_service'
import type { ActionFile } from '../../data/action_types'
import { DEFAULT_CARD_TYPES, type CardTypeConfig, type Card, type ProjectReference } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/project/worktree_service'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { openFilesService } from '../../services/open_files_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { cardDragDropService } from './card_drag_drop_service'
import { CardDragOverlay } from './card_drag_overlay'

const dragContextHandlers = vi.hoisted(() => ({
    onDragCancel: null as DndContextProps['onDragCancel'] | null,
    onDragEnd: null as DndContextProps['onDragEnd'] | null,
    onDragOver: null as DndContextProps['onDragOver'] | null,
    onDragStart: null as DndContextProps['onDragStart'] | null,
}))

vi.mock('@dnd-kit/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dnd-kit/core')>()
    const { createElement } = await import('react')

    return {
        ...actual,
        DndContext: (props: DndContextProps) => {
            dragContextHandlers.onDragCancel = props.onDragCancel ?? null
            dragContextHandlers.onDragEnd = props.onDragEnd ?? null
            dragContextHandlers.onDragOver = props.onDragOver ?? null
            dragContextHandlers.onDragStart = props.onDragStart ?? null

            return createElement(actual.DndContext, props)
        },
    }
})

function card(id: string, title: string, status: string, policy: Record<string, boolean> = {}): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: `# ${title}\n\nBody of ${id}`,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id, internalId: id.toLowerCase(), owner: null,
            policy, status, title,
            worktree: null, worktreeError: null, worktreeValue: null,
        },
        hasFrontmatter:true,
        isActive: true,
        path: `design/${id}.md`,
    }
}

const cards = [
    card('F-1', 'First', 'todo', { checkLinting: true, requireTests: false }),
    card('F-2', 'Second', 'done'),
]

function setCards(
    activeCards: Card[],
    repositoryFiles = ['app/src/app.tsx', 'design/F-1.md'],
    project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\project' },
) {
    vi.mocked(dataService.getState).mockReturnValue({
        project,
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
    project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\project' },
) {
    setCards(activeCards, repositoryFiles, project)
    render(
        <AppThemeProvider>
            <CardView
                cardTypes={DEFAULT_CARD_TYPES}
                states={[
                    { alwaysVisible: false, state: 'todo' },
                    { alwaysVisible: false, state: 'done' },
                ]}
                statusColors={new Map([['todo', '#111111'], ['done', '#222222']])}
                {...overrides}
            />
        </AppThemeProvider>,
    )
}

describe('CardView', () => {
    beforeEach(() => {
        workspaceViewService.setViewMode('cards')
        cardDragDropService.endDrag()
        vi.spyOn(dataService, 'getState')
        setCards(cards)
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
        setCards([card('F-1', 'First', 'done'), card('F-2', 'Second', 'done')])
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
        expect(dragButton).toHaveStyle({ touchAction: 'none' })
    })

    it('keeps the full card visual in the drag overlay', () => {
        renderCardView()

        act(() => dragContextHandlers.onDragStart?.({
            active: {
                id: 'design/F-1.md',
                rect: { current: { initial: { height: 107, width: 235 } } },
            },
        } as Parameters<NonNullable<DndContextProps['onDragStart']>>[0]))
        render(
            <AppThemeProvider>
                <CardDragOverlay cardTypes={DEFAULT_CARD_TYPES} />
            </AppThemeProvider>,
        )

        const overlay = screen.getByLabelText('Dragging F-1')
        expect(overlay).toHaveTextContent('F-1')
        expect(overlay).toHaveTextContent('First')
        expect(overlay).toHaveStyle({ width: '235px' })
    })

    it('updates the drop preview only when the hovered target changes', () => {
        const setDropPreview = vi.spyOn(cardDragDropService, 'setDropPreview')
        renderCardView()
        act(() => dragContextHandlers.onDragStart?.({
            active: {
                id: 'design/F-1.md',
                rect: { current: { initial: { height: 107, width: 235 } } },
            },
        } as Parameters<NonNullable<DndContextProps['onDragStart']>>[0]))
        const dragOverEvent = {
            active: { id: 'design/F-1.md' },
            over: { id: 'design/F-2.md' },
        } as Parameters<NonNullable<DndContextProps['onDragOver']>>[0]

        act(() => dragContextHandlers.onDragOver?.(dragOverEvent))
        act(() => dragContextHandlers.onDragOver?.(dragOverEvent))

        expect(setDropPreview).toHaveBeenCalledOnce()
        expect(setDropPreview).toHaveBeenCalledWith({ targetIndex: 0, targetStatus: 'done' })
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

        act(() => document.updateDraft({ content: 'Edited' }))
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

        const dialog = within(screen.getByRole('dialog', { name: 'Run actions for F-1' }))
        expect(dialog.getByRole('button', { name: 'Implement' })).toHaveAttribute('aria-pressed', 'true')
        expect(dialog.getByRole('button', { name: 'Send' })).toBeInTheDocument()
    })

    it('opens existing card commands from the icon button menu', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Open in file mode' }))

        expect(openFilesService.openPath).toHaveBeenCalledWith('design/F-1.md')
    })

    it('copies local card paths from three-dot and right-click menus and closes each menu', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.assign(navigator, { clipboard: { writeText } })
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        expect(screen.getByRole('menuitem', { name: 'Copy path' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Copy relative path' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy path' }))

        await waitFor(() => expect(writeText).toHaveBeenCalledWith('C:\\project\\design\\F-1.md'))
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()

        fireEvent.contextMenu(screen.getByText('First'))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy relative path' }))

        await waitFor(() => expect(writeText).toHaveBeenCalledWith('design/F-1.md'))
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('offers only exact relative card paths from both remote card menus', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        const remoteProject: ProjectReference = { branch: 'main', id: 'remote', owner: 'owner', repository: 'repository' }
        Object.assign(navigator, { clipboard: { writeText } })
        renderCardView({}, cards, ['app/src/app.tsx', 'design/F-1.md'], remoteProject)

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        expect(screen.queryByRole('menuitem', { name: 'Copy path' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy relative path' }))
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

        fireEvent.contextMenu(screen.getByText('First'))
        expect(screen.queryByRole('menuitem', { name: 'Copy path' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy relative path' }))

        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2))
        expect(writeText).toHaveBeenNthCalledWith(1, 'design/F-1.md')
        expect(writeText).toHaveBeenNthCalledWith(2, 'design/F-1.md')
    })

    it('reports card path clipboard failure without changing card state', async () => {
        const copyError = new Error('Clipboard denied')
        const reportError = vi.spyOn(dialogService, 'error')
        Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(copyError) } })
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Copy relative path' }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(
            copyError,
            { fallbackMessage: 'Path could not be copied to clipboard' },
        ))
        expect(dataService.cards.deleteCard).not.toHaveBeenCalled()
        expect(dataService.cards.updateCardTitle).not.toHaveBeenCalled()
        expect(dataService.cards.toggleCardPolicy).not.toHaveBeenCalled()
    })

    it('confirms before deleting from the body popup', async () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
        const confirmDialog = screen.getByRole('dialog', { name: 'Delete card' })
        fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }))

        await waitFor(() => expect(dataService.cards.deleteCard).toHaveBeenCalledWith('design/F-1.md'))
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
