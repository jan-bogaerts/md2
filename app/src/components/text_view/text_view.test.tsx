import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallback } from 'react'
import { TextView } from './text_view'
import { DEFAULT_CARD_TYPES, DEFAULT_STATES, type AgentConversation, type ProjectCard } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry_service'
import { openFilesService } from '../../services/open_files_service'
import { actionService } from '../../services/action_service'
import { configService } from '../../services/config_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { LeftPanelSlotProvider } from '../shell/left_panel_slot_provider'
import { LeftPanelTarget } from '../shell/left_panel_target'

function conversation(): AgentConversation {
    return {
        cardPath: 'design/active/F-1-a.md',
        completedAt: '2026-01-01T00:01:00.000Z',
        continuedFrom: null,
        events: [],
        id: 'agent-1',
        messages: [{ content: 'editor output', id: 'm1', role: 'agent', timestamp: '2026-01-01T00:01:00.000Z' }],
        nativeSessionId: null,
        path: '.md2-agent-logs/one.json',
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Editor agent',
    }
}

function card(path: string, overrides: Partial<ProjectCard['header']> = {}, content = ''): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        headerFields: {},
        content,
        header: {
            affects: [],
            after: null,
            agentLogReferences: [],
            author: null,
            id: 'F-0',
            internalId: null,
            owner: null,
            policy: {},
            status: null,
            title: 'Untitled',
            ...overrides,
        },
        isActive: false,
        path,
    }
}

const activeCards = [
    card('design/active/F-1-a.md', { id: 'F-1', title: 'Alpha', status: 'todo' }, '# Alpha\n\nBody A'),
    card('design/active/F-2-b.md', { id: 'F-2', title: 'Beta', status: 'done' }, '# Beta\n\nBody B'),
]
const backgroundCards = [card('design/history/rel1/F-9-old.md', { id: 'F-9', title: 'Old' }, '# Old')]
const EDITOR_STACK_HEIGHT = 1000

function renderTextView(overrides: Partial<Parameters<typeof TextView>[0]> = {}) {
    const onBodyChange = vi.fn()
    const onCreateFolder = vi.fn(async () => undefined)
    const onCreateMarkdownFile = vi.fn(async () => undefined)
    const onDeleteFile = vi.fn(async () => undefined)
    const onDeleteFolder = vi.fn(async () => undefined)
    const onHeaderFieldChange = vi.fn()
    const onTitleChange = vi.fn()
    const onTogglePolicy = vi.fn()

    function TextViewHarness() {
        const handleLeftPanelInteraction = useCallback(() => undefined, [])

        return (
            <LeftPanelSlotProvider>
                <LeftPanelTarget fallback="No project navigation available." />
                <TextView
                    actionsFolder="design/actions"
                    activeCards={activeCards}
                    backgroundCards={backgroundCards}
                    cardTypes={DEFAULT_CARD_TYPES}
                    isMobile={false}
                    onBodyChange={onBodyChange}
                    onContinueAgentConversation={vi.fn()}
                    onCreateFolder={onCreateFolder}
                    onCreateMarkdownFile={onCreateMarkdownFile}
                    onDeleteFile={onDeleteFile}
                    onDeleteFolder={onDeleteFolder}
                    onHeaderFieldChange={onHeaderFieldChange}
                    onLeftPanelInteraction={handleLeftPanelInteraction}
                    onSendAgentInput={vi.fn()}
                    onStartAgentConversation={vi.fn()}
                    onTitleChange={onTitleChange}
                    onTogglePolicy={onTogglePolicy}
                    projectFolder="design"
                    requestedNonce={0}
                    requestedPath={null}
                    repositoryFiles={[]}
                    states={DEFAULT_STATES}
                    workingFolder="design/active"
                    {...overrides}
                />
            </LeftPanelSlotProvider>
        )
    }

    render(
        <AppThemeProvider>
            <TextViewHarness />
        </AppThemeProvider>,
    )

    return {
        onBodyChange, onCreateFolder, onCreateMarkdownFile, onDeleteFile,
        onDeleteFolder, onHeaderFieldChange, onTitleChange, onTogglePolicy,
    }
}

/** Click a file leaf inside the tree region (avoids matching the same label in an open tab). */
function clickTreeFile(label: string) {
    fireEvent.click(within(screen.getByLabelText('File tree')).getByRole('button', { name: label }))
}

describe('TextView', () => {
    beforeEach(() => {
        configService.init()
        openFilesService.clear()
    })

    afterEach(() => {
        cleanup()
        actionService.clear()
        configService.clear()
        vi.restoreAllMocks()
    })

    it('centers the empty state without file controls or separators', () => {
        renderTextView()

        const message = screen.getByText('Select a file from the tree to open it.')

        expect(screen.queryByRole('button', { name: /Agents/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
        expect(message.parentElement).toHaveStyle({ alignItems: 'center', display: 'flex', justifyContent: 'center' })
    })

    it('renders a tree with status groups and special folders', () => {
        renderTextView()
        const tree = within(screen.getByLabelText('File tree'))

        expect(tree.getByText('FILES')).toBeInTheDocument()
        expect(tree.getByText('todo')).toBeInTheDocument()
        expect(tree.getByText('done')).toBeInTheDocument()
        expect(tree.getByText('history')).toBeInTheDocument()
        expect(tree.getByRole('button', { name: 'todo 1' })).toBeInTheDocument()
        expect(tree.getByRole('button', { name: 'F-1 Alpha' })).toBeInTheDocument()
        expect(tree.getByRole('button', { name: 'New folder' })).not.toHaveTextContent('New folder')
        expect(tree.getByRole('button', { name: 'New Markdown file' })).not.toHaveTextContent('New Markdown file')
        expect(tree.getByRole('tree')).toBeInTheDocument()
    })

    it('creates a root folder from the tree toolbar when no item is selected', async () => {
        const { onCreateFolder } = renderTextView()
        const tree = within(screen.getByLabelText('File tree'))

        fireEvent.click(tree.getByRole('button', { name: 'New folder' }))
        expect(screen.getByText('Location: design')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'notes' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(onCreateFolder).toHaveBeenCalledWith('design', 'notes'))
    })

    it('creates a Markdown file inside the selected folder from the tree toolbar', async () => {
        const { onCreateMarkdownFile } = renderTextView()
        const tree = within(screen.getByLabelText('File tree'))

        fireEvent.click(tree.getByRole('button', { name: 'history 1' }))
        fireEvent.click(tree.getByRole('button', { name: 'New Markdown file' }))
        expect(screen.getByText('Location: design/history')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'overview' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(onCreateMarkdownFile).toHaveBeenCalledWith('design/history', 'overview'))
    })

    it('creates beside a selected root file from the tree toolbar', async () => {
        const { onCreateFolder } = renderTextView()
        const tree = within(screen.getByLabelText('File tree'))

        fireEvent.click(tree.getByRole('button', { name: 'F-1 Alpha' }))
        fireEvent.click(tree.getByRole('button', { name: 'New folder' }))
        expect(screen.getByText('Location: design')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'root-notes' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(onCreateFolder).toHaveBeenCalledWith('design', 'root-notes'))
    })

    it('creates in the project folder when a state group is selected', async () => {
        const { onCreateMarkdownFile } = renderTextView()
        const tree = within(screen.getByLabelText('File tree'))

        fireEvent.click(tree.getByRole('button', { name: 'todo 1' }))
        fireEvent.click(tree.getByRole('button', { name: 'New Markdown file' }))
        expect(screen.getByText('Location: design')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'state-notes' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(onCreateMarkdownFile).toHaveBeenCalledWith('design', 'state-notes'))
    })

    it('offers both creation actions in a file context menu and targets the file parent folder', async () => {
        const { onCreateFolder } = renderTextView()
        const tree = within(screen.getByLabelText('File tree'))
        const file = tree.getByRole('button', { name: 'F-9 Old' })

        fireEvent.contextMenu(file)
        const menu = within(screen.getByRole('menu'))
        expect(menu.getByRole('menuitem', { name: 'New folder' })).toBeInTheDocument()
        expect(menu.getByRole('menuitem', { name: 'New Markdown file' })).toBeInTheDocument()
        fireEvent.click(menu.getByRole('menuitem', { name: 'New folder' }))
        fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'drafts' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(onCreateFolder).toHaveBeenCalledWith('design/history/rel1', 'drafts'))
    })

    it('opens a file in a tab when its tree node is clicked', () => {
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)
        renderTextView()

        clickTreeFile('F-1 Alpha')

        const tab = screen.getByRole('tab', { name: /Alpha/ })
        expect(within(tab).getByText('F-1')).toBeInTheDocument()
        expect(within(tab).getByText('Alpha')).toBeInTheDocument()
        expect(screen.getByDisplayValue(/Body A/)).toBeInTheDocument()
        expect(trackEvent).toHaveBeenCalledWith('navigation')

        trackEvent.mockRestore()
    })

    it('shows the file type icon in action, card, and Markdown tabs', () => {
        const actionFile = card('design/actions/implement.md', { title: 'Implement' }, '# Implement')
        const markdownFile = card('design/notes.md', { title: 'Notes' }, '# Notes')
        renderTextView({ backgroundCards: [...backgroundCards, actionFile, markdownFile] })

        clickTreeFile('Implement')
        clickTreeFile('F-1 Alpha')
        clickTreeFile('Notes')

        expect(within(screen.getByRole('tab', { name: 'Implement' })).getByRole('img', { name: 'Action file' })).toBeInTheDocument()
        expect(within(screen.getByRole('tab', { name: 'F-1 Alpha' })).getByRole('img', { name: 'Card' })).toBeInTheDocument()
        expect(within(screen.getByRole('tab', { name: 'Notes' })).getByRole('img', { name: 'Markdown file' })).toBeInTheDocument()
    })

    it('opens JSON-backed action objects in the structured action editor', () => {
        actionService.loadFromFiles([{
            content: JSON.stringify({
                description: 'Review the selected file', id: 'review-id', label: 'Review code',
                name: 'review', prompt: 'Review {{file}}', type: 'agent',
            }),
            path: 'design/actions/review.json',
        }])
        renderTextView()

        clickTreeFile('Review code')

        expect(screen.getByRole('tab', { name: 'Review code' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Action definition' })).toBeInTheDocument()
        expect(screen.getByLabelText('ID')).toHaveValue('review-id')
        expect(screen.queryByText(/"description":/u)).not.toBeInTheDocument()
    })

    it('focuses the existing tab instead of duplicating when a file is reopened', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')
        clickTreeFile('F-2 Beta')
        clickTreeFile('F-1 Alpha')

        expect(screen.getAllByRole('tab', { name: /Alpha/ })).toHaveLength(1)
        expect(screen.getByDisplayValue(/Body A/)).toBeInTheDocument()
    })

    it('remounts the markdown editor by file so undo history cannot cross tab switches', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')
        const alphaEditor = screen.getByTestId('mdx-editor')

        clickTreeFile('F-2 Beta')
        const betaEditor = screen.getByTestId('mdx-editor')
        expect(betaEditor).not.toBe(alphaEditor)

        fireEvent.click(screen.getByRole('tab', { name: /Alpha/ }))

        expect(screen.getByTestId('mdx-editor')).not.toBe(betaEditor)
    })

    it('closes a tab from the tab bar', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')
        clickTreeFile('F-2 Beta')
        fireEvent.click(screen.getByRole('button', { name: 'Close F-1 Alpha' }))

        expect(screen.queryByRole('tab', { name: /Alpha/ })).not.toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /Beta/ })).toBeInTheDocument()
    })

    it('confirms tree deletion and closes the matching open tab after success', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
        const { onDeleteFile } = renderTextView()

        clickTreeFile('F-1 Alpha')
        fireEvent.click(screen.getByRole('button', { name: 'Delete design/active/F-1-a.md' }))

        expect(confirm).toHaveBeenCalledWith(expect.stringContaining('design/active/F-1-a.md'))
        expect(onDeleteFile).toHaveBeenCalledWith('design/active/F-1-a.md')
        await waitFor(() => expect(screen.queryByRole('tab', { name: /Alpha/ })).not.toBeInTheDocument())

        confirm.mockRestore()
    })

    it('deletes a user folder recursively from its trash icon after confirmation', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
        const nestedCard = card('design/notes/nested.md', { title: 'Nested' }, '# Nested')
        const { onDeleteFolder } = renderTextView({
            backgroundCards: [...backgroundCards, nestedCard],
            repositoryFiles: ['design/notes/.gitkeep', nestedCard.path],
        })

        clickTreeFile('Nested')
        fireEvent.click(screen.getByRole('button', { name: 'Delete design/notes' }))

        expect(confirm).toHaveBeenCalledWith('Delete design/notes and all files inside it?')
        expect(onDeleteFolder).toHaveBeenCalledWith('design/notes')
        await waitFor(() => expect(screen.queryByRole('tab', { name: 'Nested' })).not.toBeInTheDocument())
        expect(screen.queryByRole('button', { name: 'Delete design/history' })).not.toBeInTheDocument()

        confirm.mockRestore()
    })

    it('offers recursive user-folder deletion in the context menu', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
        const { onDeleteFolder } = renderTextView({ repositoryFiles: ['design/notes/.gitkeep'] })
        const tree = within(screen.getByLabelText('File tree'))

        fireEvent.contextMenu(tree.getByRole('button', { name: 'notes 0' }))
        fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Delete folder' }))

        await waitFor(() => expect(onDeleteFolder).toHaveBeenCalledWith('design/notes'))
        expect(confirm).toHaveBeenCalledWith('Delete design/notes and all files inside it?')

        confirm.mockRestore()
    })

    it('persists edits through onBodyChange when another file is opened', () => {
        const { onBodyChange } = renderTextView()

        clickTreeFile('F-1 Alpha')
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited body' } })
        expect(onBodyChange).not.toHaveBeenCalled()
        clickTreeFile('F-2 Beta')

        expect(onBodyChange).toHaveBeenCalledWith('design/active/F-1-a.md', 'Edited body')
    })

    it('opens the requested file when the open nonce changes', () => {
        const shared = {
            actionsFolder: 'design/actions',
            activeCards,
            backgroundCards,
            cardTypes: DEFAULT_CARD_TYPES,
            isMobile: false,
            onBodyChange: vi.fn(),
            onContinueAgentConversation: vi.fn(),
            onCreateFolder: vi.fn(async () => undefined),
            onCreateMarkdownFile: vi.fn(async () => undefined),
            onDeleteFile: vi.fn(async () => undefined),
            onDeleteFolder: vi.fn(async () => undefined),
            onHeaderFieldChange: vi.fn(),
            onLeftPanelInteraction: vi.fn(),
            onSendAgentInput: vi.fn(),
            onStartAgentConversation: vi.fn(),
            onTitleChange: vi.fn(),
            onTogglePolicy: vi.fn(),
            projectFolder: 'design',
            repositoryFiles: [],
            states: DEFAULT_STATES,
            workingFolder: 'design/active',
        }
        const { rerender } = render(
            <AppThemeProvider>
                <LeftPanelSlotProvider>
                    <LeftPanelTarget fallback="No project navigation available." />
                    <TextView {...shared} requestedNonce={0} requestedPath={null} />
                </LeftPanelSlotProvider>
            </AppThemeProvider>,
        )

        rerender(
            <AppThemeProvider>
                <LeftPanelSlotProvider>
                    <LeftPanelTarget fallback="No project navigation available." />
                    <TextView {...shared} requestedNonce={1} requestedPath="design/active/F-2-b.md" />
                </LeftPanelSlotProvider>
            </AppThemeProvider>,
        )

        expect(screen.getByRole('tab', { name: /Beta/ })).toBeInTheDocument()
    })

    it('updates the left-panel tree when cards change without a view-mode switch', () => {
        const shared = {
            actionsFolder: 'design/actions',
            backgroundCards: [],
            cardTypes: DEFAULT_CARD_TYPES,
            isMobile: false,
            onBodyChange: vi.fn(),
            onContinueAgentConversation: vi.fn(),
            onCreateFolder: vi.fn(async () => undefined),
            onCreateMarkdownFile: vi.fn(async () => undefined),
            onDeleteFile: vi.fn(async () => undefined),
            onDeleteFolder: vi.fn(async () => undefined),
            onHeaderFieldChange: vi.fn(),
            onLeftPanelInteraction: vi.fn(),
            onSendAgentInput: vi.fn(),
            onStartAgentConversation: vi.fn(),
            onTitleChange: vi.fn(),
            onTogglePolicy: vi.fn(),
            requestedNonce: 0,
            requestedPath: null,
            projectFolder: 'design',
            repositoryFiles: [],
            states: DEFAULT_STATES,
            workingFolder: 'design/active',
        }
        const { rerender } = render(
            <AppThemeProvider>
                <LeftPanelSlotProvider>
                    <LeftPanelTarget fallback="No project navigation available." />
                    <TextView {...shared} activeCards={[activeCards[0]]} />
                </LeftPanelSlotProvider>
            </AppThemeProvider>,
        )

        expect(within(screen.getByLabelText('File tree')).getByRole('button', { name: 'F-1 Alpha' })).toBeInTheDocument()
        expect(within(screen.getByLabelText('File tree')).queryByRole('button', { name: 'F-2 Beta' })).toBeNull()

        rerender(
            <AppThemeProvider>
                <LeftPanelSlotProvider>
                    <LeftPanelTarget fallback="No project navigation available." />
                    <TextView {...shared} activeCards={activeCards} />
                </LeftPanelSlotProvider>
            </AppThemeProvider>,
        )

        expect(within(screen.getByLabelText('File tree')).getByRole('button', { name: 'F-2 Beta' })).toBeInTheDocument()
    })

    it('publishes the tree as left-panel content on mobile', () => {
        renderTextView({ isMobile: true })

        clickTreeFile('F-1 Alpha')

        expect(screen.getByDisplayValue(/Body A/)).toBeInTheDocument()
    })

    it('keeps the formatting toolbar sticky above the editor on mobile', () => {
        renderTextView({ isMobile: true })
        clickTreeFile('F-1 Alpha')

        expect(document.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
    })

    it('pins the formatting toolbar above the document on desktop', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')

        expect(document.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
    })

    it('renders the Agents control inside the markdown editor toolbar', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')

        const editorToolbar = within(screen.getByTestId('mdx-editor-toolbar'))
        expect(editorToolbar.getByRole('button', { name: /Agents/ })).toBeInTheDocument()
    })

    it('publishes the desktop tree without a Browse files button', () => {
        renderTextView()

        expect(screen.queryByRole('button', { name: /Browse files/ })).not.toBeInTheDocument()
        expect(within(screen.getByLabelText('File tree')).getByRole('button', { name: 'F-1 Alpha' })).toBeInTheDocument()
    })

    it('opens the conversation panel and continues the active card conversation', () => {
        const agentConversation = conversation()
        const onContinueAgentConversation = vi.fn()
        renderTextView({
            activeCards: [{ ...activeCards[0], agentConversations: [agentConversation] }],
            onContinueAgentConversation,
        })

        clickTreeFile('F-1 Alpha')
        fireEvent.click(screen.getByRole('button', { name: /Agents/ }))
        expect(screen.getByText('Editor agent')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

        expect(onContinueAgentConversation).toHaveBeenCalledWith('design/active/F-1-a.md', agentConversation)
    })

    it('resizes the conversation panel from the desktop separator', () => {
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
            bottom: EDITOR_STACK_HEIGHT,
            height: EDITOR_STACK_HEIGHT,
            left: 0,
            right: 0,
            toJSON: () => ({}),
            top: 0,
            width: 0,
            x: 0,
            y: 0,
        })
        const agentConversation = conversation()
        renderTextView({ activeCards: [{ ...activeCards[0], agentConversations: [agentConversation] }] })

        clickTreeFile('F-1 Alpha')
        fireEvent.click(screen.getByRole('button', { name: /Agents/ }))
        const separator = screen.getByRole('separator', { name: 'Resize conversation panel' })
        fireEvent.pointerDown(separator, { pointerId: 1 })
        fireEvent.pointerMove(separator, { clientY: 500, pointerId: 1 })
        fireEvent.pointerUp(separator, { pointerId: 1 })

        expect(separator).toHaveAttribute('aria-valuenow', '500')
    })

    it('starts a new agent conversation for the active text tab', () => {
        const onStartAgentConversation = vi.fn()
        renderTextView({ onStartAgentConversation })

        clickTreeFile('F-1 Alpha')
        fireEvent.click(screen.getByRole('button', { name: /Agents/ }))
        fireEvent.change(screen.getByLabelText('Agent prompt'), { target: { value: 'review this file' } })
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))

        expect(onStartAgentConversation).toHaveBeenCalledWith('design/active/F-1-a.md', 'review this file')
    })

    it('opens Properties from the toolbar for a card with frontmatter', () => {
        const cardWithHeader = { ...activeCards[0], headerFields: { id: 'F-1', status: 'todo', title: 'Alpha' } }
        renderTextView({ activeCards: [cardWithHeader, activeCards[1]] })

        clickTreeFile('F-1 Alpha')

        expect(screen.queryByRole('dialog', { name: 'Card properties popup' })).not.toBeInTheDocument()
        fireEvent.click(within(screen.getByTestId('mdx-editor-toolbar')).getByRole('button', { name: 'Properties' }))

        const propertiesPopup = within(screen.getByRole('dialog', { name: 'Card properties popup' }))
        expect(propertiesPopup.getByRole('heading', { name: 'Properties' })).toBeInTheDocument()
        expect(screen.getByLabelText('Card title')).toHaveValue('Alpha')
        expect(within(screen.getByLabelText('Card properties')).getByText('todo')).toBeInTheDocument()
    })

    it('routes Title, Author, and Policy edits through card workflows', () => {
        const cardWithHeader = {
            ...activeCards[0],
            header: { ...activeCards[0].header, author: 'JB' },
            headerFields: { author: 'JB', id: 'F-1', status: 'todo', title: 'Alpha' },
        }
        const { onHeaderFieldChange, onTitleChange, onTogglePolicy } = renderTextView({ activeCards: [cardWithHeader, activeCards[1]] })
        clickTreeFile('F-1 Alpha')
        fireEvent.click(within(screen.getByTestId('mdx-editor-toolbar')).getByRole('button', { name: 'Properties' }))

        fireEvent.change(screen.getByLabelText('Card title'), { target: { value: 'Renamed' } })
        fireEvent.blur(screen.getByLabelText('Card title'))
        fireEvent.change(screen.getByLabelText('Card author'), { target: { value: 'AB' } })
        fireEvent.blur(screen.getByLabelText('Card author'))
        fireEvent.mouseDown(screen.getByLabelText('Card policy'))
        fireEvent.click(screen.getByRole('option', { name: 'Auto-merge' }))

        expect(onTitleChange).toHaveBeenCalledWith('design/active/F-1-a.md', 'Renamed')
        expect(onHeaderFieldChange).toHaveBeenCalledWith('design/active/F-1-a.md', 'author', 'AB')
        expect(onTogglePolicy).toHaveBeenCalledWith('design/active/F-1-a.md', 'autoMerge')
    })

    it('renders no Properties toolbar button for files without frontmatter', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')

        expect(within(screen.getByTestId('mdx-editor-toolbar')).queryByRole('button', { name: 'Properties' })).not.toBeInTheDocument()
    })
})
