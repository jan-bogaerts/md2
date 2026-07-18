import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CardView } from './card_view'
import { CardColumn } from './card_column'
import { actionService } from '../../services/actions/action_service'
import type { ActionFile } from '../../data/action_types'
import { DEFAULT_CARD_TYPES, type CardTypeConfig, type ProjectCard } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { dataService } from '../../services/data/data_service'

function card(id: string, title: string, status: string, policy: Record<string, boolean> = {}): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        headerFields: {},
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

function actionFile(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

function createColumnHandlers() {
    return {
        onDeleteCard: vi.fn(async () => undefined),
        onOpenBody: vi.fn(),
        onOpenInFileMode: vi.fn(),
        onTitleChange: vi.fn(),
        onTogglePolicy: vi.fn(),
        onWorktreeChange: vi.fn(),
    }
}

function createCardHandlers() {
    return { ...createColumnHandlers(), onAffectsChange: vi.fn(), onBodyChange: vi.fn(), onMoveCard: vi.fn() }
}

function renderCardView(overrides: Partial<Parameters<typeof CardView>[0]> = {}) {
    const handlers = createCardHandlers()

    render(
        <AppThemeProvider>
            <CardView
                cardTypes={DEFAULT_CARD_TYPES}
                cards={cards}
                isMobile={false}
                primaryPath="C:\\project"
                projectKey="project:main"
                repositoryFiles={['app/src/app.tsx', 'design/F-1.md']}
                selectedPath={null}
                states={[
                    { alwaysVisible: false, state: 'todo' },
                    { alwaysVisible: false, state: 'done' },
                ]}
                {...handlers}
                {...overrides}
            />
        </AppThemeProvider>,
    )

    return handlers
}

describe('CardView', () => {
    beforeEach(() => {
        vi.spyOn(dataService, 'hasPendingActionFile').mockReturnValue(false)
    })

    afterEach(() => {
        cleanup()
        actionService.clear()
        vi.restoreAllMocks()
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
            cards: [],
            states: [
                { alwaysVisible: true, state: 'new' },
                { alwaysVisible: false, state: 'design' },
                { alwaysVisible: true, state: 'done' },
            ],
        })

        expect(screen.getByLabelText('new column')).toHaveTextContent('Drop a card here')
        expect(screen.getByLabelText('done column')).toHaveTextContent('Drop a card here')
        expect(screen.queryByText('design')).not.toBeInTheDocument()
    })

    it('inserts a card-sized drop position between target-column cards', () => {
        const handlers = createColumnHandlers()
        render(
            <AppThemeProvider>
                <DndContext>
                    <CardColumn
                        cardTypes={DEFAULT_CARD_TYPES}
                        column={{ cards: [card('F-1', 'First', 'done'), card('F-2', 'Second', 'done')], color: '#123456', status: 'done' }}
                        dropPreviewHeight={123}
                        dropPreviewIndex={1}
                        isMobile={false}
                        openBodyPath={null}
                        primaryPath="C:\\project"
                        projectKey="project:main"
                        selectedPath={null}
                        worktrees={[]}
                        {...handlers}
                    />
                </DndContext>
            </AppThemeProvider>,
        )

        const firstCard = screen.getByRole('button', { name: 'Drag F-1' })
        const secondCard = screen.getByRole('button', { name: 'Drag F-2' })
        const dropPosition = screen.getByLabelText('Card drop position')
        expect(firstCard.compareDocumentPosition(dropPosition) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(dropPosition.compareDocumentPosition(secondCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(dropPosition).toHaveStyle({ minHeight: '123px' })
    })

    it('shows ids above titles without card type footnotes or an affects control', () => {
        const customCardTypes: CardTypeConfig[] = [
            ...DEFAULT_CARD_TYPES,
            { color: '#123456', idPrefix: 'R', label: 'Research', type: 'research' },
        ]
        renderCardView({
            cards: [
                card('F-012', 'Feature card', 'todo'),
                card('B-003', 'Bug card', 'todo'),
                card('X-001', 'Unknown card', 'todo'),
                card('R-007', 'Research card', 'todo'),
            ],
            cardTypes: customCardTypes,
        })

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
        const handlers = renderCardView()
        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        const checkLintingButton = screen.getByRole('menuitem', { name: 'Toggle checkLinting' })

        expect(checkLintingButton).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(checkLintingButton)

        expect(handlers.onTogglePolicy).toHaveBeenCalledWith('design/F-1.md', 'checkLinting')
    })

    it('edits the title from the card actions and commits on Enter', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Edit title' }))
        const input = screen.getByDisplayValue('First')
        fireEvent.change(input, { target: { value: 'Renamed' } })
        fireEvent.keyDown(input, { key: 'Enter' })

        expect(handlers.onTitleChange).toHaveBeenCalledWith('design/F-1.md', 'Renamed')
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

    it('routes the file-mode action from the popup to the callback', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        fireEvent.click(screen.getByRole('button', { name: 'Open in file mode' }))

        expect(handlers.onOpenInFileMode).toHaveBeenCalledWith('design/F-1.md')
    })

    it('edits the title from the card popup and commits on Enter', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        const titleInput = within(screen.getByRole('dialog')).getByRole('textbox', { name: 'Card title' })
        fireEvent.change(titleInput, { target: { value: 'Renamed in popup' } })
        fireEvent.keyDown(titleInput, { key: 'Enter' })

        expect(handlers.onTitleChange).toHaveBeenCalledWith('design/F-1.md', 'Renamed in popup')
    })

    it('expands and restores the card popup from the formatting toolbar', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fullscreen' }))

        expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument()
    })

    it('shows dirty immediately when the card body is edited', () => {
        renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        expect(within(screen.getByRole('dialog')).getByText('Saved')).toBeInTheDocument()

        fireEvent.change(within(screen.getByRole('dialog')).getByDisplayValue(/Body of F-1/u), {target: { value: 'Edited body' }})

        expect(within(screen.getByRole('dialog')).getByText('Dirty')).toBeInTheDocument()
    })

    it('tracks pending commits for the open card', () => {
        const hasPendingFile = vi.mocked(dataService.hasPendingActionFile)
        renderCardView()
        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))

        hasPendingFile.mockReturnValue(true)
        act(() => dataService.dispatchEvent(new Event('changed')))
        expect(within(screen.getByRole('dialog')).getByText('Dirty')).toBeInTheDocument()

        hasPendingFile.mockReturnValue(false)
        act(() => dataService.dispatchEvent(new Event('changed')))
        expect(within(screen.getByRole('dialog')).getByText('Saved')).toBeInTheDocument()
    })

    it('routes the file-mode action from the card header without opening the popup', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Open F-1 in file mode' }))

        expect(handlers.onOpenInFileMode).toHaveBeenCalledWith('design/F-1.md')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('confirms before deleting from the card actions menu', async () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
        const dialog = screen.getByRole('dialog', { name: 'Delete card' })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

        await waitFor(() => expect(handlers.onDeleteCard).toHaveBeenCalledWith('design/F-1.md'))
    })

    it('does not delete from the card actions menu when confirmation is cancelled', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
        const dialog = screen.getByRole('dialog', { name: 'Delete card' })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

        expect(handlers.onDeleteCard).not.toHaveBeenCalled()
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

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByRole('heading', { name: 'Implement' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Run' })).toBeInTheDocument()
    })

    it('opens existing card commands from the icon button menu', () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Card actions for F-1' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Open in file mode' }))

        expect(handlers.onOpenInFileMode).toHaveBeenCalledWith('design/F-1.md')
    })

    it('confirms before deleting from the body popup', async () => {
        const handlers = renderCardView()

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
        const confirmDialog = screen.getByRole('dialog', { name: 'Delete card' })
        fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }))

        await waitFor(() => expect(handlers.onDeleteCard).toHaveBeenCalledWith('design/F-1.md'))
    })

    it('opens the card-relative popup on mobile', () => {
        renderCardView({ isMobile: true })

        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByDisplayValue(/Body of F-1/)).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Affects' })).toBeInTheDocument()
        expect(screen.getByRole('separator', { name: 'Resize card details popup' })).toBeInTheDocument()
    })

    it('highlights the card matching the selected path', () => {
        const { container } = render(
            <AppThemeProvider>
                <CardView
                    cardTypes={DEFAULT_CARD_TYPES}
                    cards={cards}
                    isMobile={false}
                    onAffectsChange={vi.fn()}
                    onBodyChange={vi.fn()}
                    onDeleteCard={vi.fn(async () => undefined)}
                    onMoveCard={vi.fn()}
                    onOpenInFileMode={vi.fn()}
                    onTitleChange={vi.fn()}
                    onTogglePolicy={vi.fn()}
                    onWorktreeChange={vi.fn()}
                    primaryPath="C:\\project"
                    projectKey="project:main"
                    repositoryFiles={[]}
                    selectedPath="design/F-2.md"
                    states={[
                        { alwaysVisible: false, state: 'todo' },
                        { alwaysVisible: false, state: 'done' },
                    ]}
                />
            </AppThemeProvider>,
        )

        const selected = container.querySelectorAll('[data-selected="true"]')
        expect(selected).toHaveLength(1)
        expect(within(selected[0] as HTMLElement).getByText('Second')).toBeInTheDocument()
    })

    it('removes board conversation controls and assigns the primary worktree', () => {
        const handlers = renderCardView()

        expect(screen.queryByRole('button', { name: /Agent conversations/u })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: /F-1: C:.*project; agent idle/u }))
        fireEvent.click(screen.getByRole('menuitem', { name: /Primary — C:.*project/u }))

        expect(handlers.onWorktreeChange).toHaveBeenCalledWith('design/F-1.md', null)
    })

    it('shows the affects control in the card popup and saves changes', () => {
        const handlers = renderCardView({ repositoryFiles: ['app/src/app.tsx', 'design/F-1.md'] })

        expect(screen.queryByRole('button', { name: 'Affects' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Drag F-1' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Affects' }))
        fireEvent.change(screen.getByRole('combobox', { name: 'Add affected file' }), { target: { value: 'app/src/app.tsx' } })
        fireEvent.click(screen.getByRole('button', { name: 'Add' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))

        expect(handlers.onAffectsChange).toHaveBeenCalledWith('design/F-1.md', ['app/src/app.tsx'])
    })
})
