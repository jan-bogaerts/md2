import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCallback } from 'react'
import { TextView } from './text_view'
import { DEFAULT_CARD_TYPES, DEFAULT_STATES, defaultColumnAccent, type ProjectCard } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { openFilesService } from '../../services/open_files_service'
import { actionService } from '../../services/actions/action_service'
import { configService } from '../../services/config/config_service'
import { dataService } from '../../services/data/data_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { actionMarkdownDataSource } from '../editor/action_markdown_data_source'
import { cardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { FileTreeView } from './file_tree_view'

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
            internalId: path,
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

function setProjectCards(
    nextActiveCards: ProjectCard[],
    nextBackgroundCards = backgroundCards,
    repositoryFiles: string[] = [],
) {
    vi.mocked(dataService.getState).mockReturnValue({
        project: null,
        runningAgents: [],
        snapshot: {
            activeCards: nextActiveCards,
            backgroundCards: nextBackgroundCards,
            repositoryFiles,
            workingFolder: 'design/active',
        },
    })
}

function renderTextView(
    overrides: Partial<Parameters<typeof TextView>[0]> = {},
    nextActiveCards = activeCards,
    nextBackgroundCards = backgroundCards,
    repositoryFiles: string[] = [],
) {
    setProjectCards(nextActiveCards, nextBackgroundCards, repositoryFiles)

    function TextViewHarness() {
        const handleLeftPanelInteraction = useCallback(() => undefined, [])
        const handleCreateFolder = useCallback(async (parentDirectory: string, name: string) => {
            await dataService.cards.createFolder(parentDirectory, name)
        }, [])
        const handleCreateMarkdownFile = useCallback(async (parentDirectory: string, name: string) => {
            await dataService.cards.createMarkdownFile(parentDirectory, name)
        }, [])
        const handleDeleteFile = useCallback(async (path: string) => {
            await dataService.cards.deleteFile(path)
            const document = openFilesService.getSnapshot().documents.find((candidate) => (
                candidate.kind === 'card' ? candidate.getObject().path : candidate.getObject().sourcePath
            ) === path)
            if (document) openFilesService.closeDocument(document)
        }, [])
        const handleDeleteFolder = useCallback(async (path: string) => {
            await dataService.cards.deleteFolder(path)
        }, [])
        const statusColors = new Map(
            DEFAULT_STATES.map(({ color, state }, index) => [state, color ?? defaultColumnAccent(index)]),
        )

        return (
            <>
                <div aria-label="File tree">
                    <FileTreeView
                        actionsFolder="design/actions"
                        cardTypes={DEFAULT_CARD_TYPES}
                        onCreateFolder={handleCreateFolder}
                        onCreateMarkdownFile={handleCreateMarkdownFile}
                        onDeleteFile={handleDeleteFile}
                        onDeleteFolder={handleDeleteFolder}
                        onLeftPanelInteraction={handleLeftPanelInteraction}
                        projectFolder="design"
                        statusColors={statusColors}
                        workingFolder="design/active"
                    />
                </div>
                <TextView
                    actionsFolder="design/actions"
                    cardTypes={DEFAULT_CARD_TYPES}
                    projectFolder="design"
                    states={DEFAULT_STATES}
                    {...overrides}
                />
            </>
        )
    }

    render(
        <AppThemeProvider>
            <TextViewHarness />
        </AppThemeProvider>,
    )
}

/** Click a file leaf inside the tree region (avoids matching the same label in an open tab). */
function clickTreeFile(label: string) {
    fireEvent.click(within(screen.getByLabelText('File tree')).getByRole('button', { name: label }))
}

function loadReviewAction() {
    actionService.loadFromFiles([{
        content: JSON.stringify({
            description: 'Review the selected file',
            id: 'review-action',
            label: 'Review',
            prompt: 'Review it',
            type: 'agent',
        }),
        path: 'design/actions/review.json',
    }])
}

function loadMarkdownActions() {
    actionService.loadFromFiles([
        {
            content: JSON.stringify({
                description: 'Review the selected file',
                id: 'review-action',
                label: 'Review',
                phrases: [
                    { text: 'Run tests', title: 'Tests' },
                    { text: 'Check lint', title: 'Lint' },
                ],
                prompt: 'Review it',
                type: 'agent',
            }),
            path: 'design/actions/review.json',
        },
        {
            content: JSON.stringify({
                description: 'Summarize the selected file',
                id: 'summarize-action',
                label: 'Summarize',
                prompt: 'Summarize it',
                type: 'agent',
            }),
            path: 'design/actions/summarize.json',
        },
        {
            content: JSON.stringify({
                command: 'npm run test',
                description: 'Run tests',
                id: 'test-action',
                label: 'Test',
                type: 'command',
            }),
            path: 'design/actions/test.json',
        },
    ])
}

describe('TextView', () => {
    beforeEach(() => {
        workspaceViewService.setViewMode('text')
        vi.spyOn(dataService, 'getState')
        setProjectCards(activeCards)
        configService.init()
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        openFilesService.init({ actionService, dataService })
        vi.spyOn(dataService.cards, 'createFolder').mockResolvedValue('design/notes')
        vi.spyOn(dataService.cards, 'createMarkdownFile').mockResolvedValue({ content: '', path: 'design/notes.md' })
        vi.spyOn(dataService.cards, 'deleteFile').mockResolvedValue(null)
        vi.spyOn(dataService.cards, 'deleteFolder').mockResolvedValue(null)
        actionMarkdownDataSource.init(actionService)
        vi.spyOn(cardMarkdownDataSource, 'getMarkdown').mockImplementation((target) => target.document.kind === 'card'
            ? target.document.getDraft().content
            : '')
        vi.spyOn(cardMarkdownDataSource, 'edit').mockImplementation(() => undefined)
        vi.spyOn(cardMarkdownDataSource, 'commit').mockReturnValue(true)
        vi.spyOn(cardMarkdownDataSource, 'getActiveCard').mockImplementation(() => {
            const activeDocument = openFilesService.getSnapshot().activeDocument

            return activeDocument?.kind === 'card' ? activeDocument.getObject() : null
        })
    })

    afterEach(() => {
        delete window.md2Actions
        cleanup()
        workspaceViewService.setViewMode('cards')
        for (const document of openFilesService.getRegisteredDocuments()) openFilesService.discardDocument(document)
        actionService.clear()
        configService.clear()
        vi.restoreAllMocks()
    })

    it('keeps hidden text view mounted without occupying layout', () => {
        workspaceViewService.setViewMode('cards')
        renderTextView()

        const emptyState = screen.getByText('Select a file from the tree to open it.')

        expect(emptyState).not.toBeVisible()
        expect(emptyState.closest('[style*="display: none"]')).toHaveStyle({ display: 'none' })
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
        renderTextView()
        const tree = within(screen.getByLabelText('File tree'))

        fireEvent.click(tree.getByRole('button', { name: 'New folder' }))
        expect(screen.getByText('Location: design')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'notes' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(dataService.cards.createFolder).toHaveBeenCalledWith('design', 'notes'))
    })

    it('creates a Markdown file inside the selected folder from the tree toolbar', async () => {
        renderTextView()
        const tree = within(screen.getByLabelText('File tree'))

        fireEvent.click(tree.getByRole('button', { name: 'history 1' }))
        fireEvent.click(tree.getByRole('button', { name: 'New Markdown file' }))
        expect(screen.getByText('Location: design/history')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'overview' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(dataService.cards.createMarkdownFile).toHaveBeenCalledWith('design/history', 'overview'))
    })

    it('creates beside a selected root file from the tree toolbar', async () => {
        renderTextView()
        const tree = within(screen.getByLabelText('File tree'))

        fireEvent.click(tree.getByRole('button', { name: 'F-1 Alpha' }))
        fireEvent.click(tree.getByRole('button', { name: 'New folder' }))
        expect(screen.getByText('Location: design')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'root-notes' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(dataService.cards.createFolder).toHaveBeenCalledWith('design', 'root-notes'))
    })

    it('creates in the project folder when a state group is selected', async () => {
        renderTextView()
        const tree = within(screen.getByLabelText('File tree'))

        fireEvent.click(tree.getByRole('button', { name: 'todo 1' }))
        fireEvent.click(tree.getByRole('button', { name: 'New Markdown file' }))
        expect(screen.getByText('Location: design')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'state-notes' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(dataService.cards.createMarkdownFile).toHaveBeenCalledWith('design', 'state-notes'))
    })

    it('offers both creation actions in a file context menu and targets the file parent folder', async () => {
        renderTextView()
        const tree = within(screen.getByLabelText('File tree'))
        const file = tree.getByRole('button', { name: 'F-9 Old' })

        fireEvent.contextMenu(file)
        const menu = within(screen.getByRole('menu'))
        expect(menu.getByRole('menuitem', { name: 'New folder' })).toBeInTheDocument()
        expect(menu.getByRole('menuitem', { name: 'New Markdown file' })).toBeInTheDocument()
        fireEvent.click(menu.getByRole('menuitem', { name: 'New folder' }))
        fireEvent.change(screen.getByLabelText('Folder name'), { target: { value: 'drafts' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => expect(dataService.cards.createFolder).toHaveBeenCalledWith('design/history/rel1', 'drafts'))
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
        renderTextView({}, activeCards, [...backgroundCards, actionFile, markdownFile])

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
                name: 'review', prompt: 'Review {{card-file}}', type: 'agent',
            }),
            path: 'design/actions/review.json',
        }])
        renderTextView()

        clickTreeFile('Review code')

        expect(screen.getByRole('tab', { name: 'Review code' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Action definition' })).toBeInTheDocument()
        expect(screen.getByLabelText('Label')).toHaveValue('Review code')
        expect(screen.queryByText(/"description":/u)).not.toBeInTheDocument()
        expect(screen.getByTestId('editor-content-pane')).toHaveStyle({ display: 'flex', minHeight: '0', overflow: 'hidden' })
    })

    it('restores an action editor section after another file becomes active', () => {
        actionService.loadFromFiles([{
            content: JSON.stringify({
                description: 'Review the selected file', id: 'review-id', label: 'Review code',
                phrases: [{ text: 'Run tests', title: 'Tests' }], prompt: 'Review {{card-file}}', type: 'agent',
            }),
            path: 'design/actions/review.json',
        }])
        renderTextView()

        clickTreeFile('Review code')
        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))
        clickTreeFile('F-1 Alpha')
        clickTreeFile('Review code')

        expect(screen.getByRole('tab', { name: 'Tests' })).toHaveAttribute('aria-selected', 'true')
    }, 10_000)

    it('restores an action editor section after closing and reopening its tab', () => {
        actionService.loadFromFiles([{
            content: JSON.stringify({
                description: 'Review the selected file', id: 'review-id', label: 'Review code',
                phrases: [{ text: 'Run tests', title: 'Tests' }], prompt: 'Review {{card-file}}', type: 'agent',
            }),
            path: 'design/actions/review.json',
        }])
        renderTextView()

        clickTreeFile('Review code')
        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))
        fireEvent.click(screen.getByRole('button', { name: 'Close Review code' }))
        clickTreeFile('Review code')

        expect(screen.getByRole('tab', { name: 'Tests' })).toHaveAttribute('aria-selected', 'true')
    }, 10_000)

    it('reloads and reopens an action by stable path without duplicating its tab', async () => {
        const path = 'design/actions/review.json'
        const actionDefinition = {
            description: 'Review the selected file', id: 'review-id', label: 'Review code',
            name: 'review', prompt: 'Review {{card-file}}', type: 'agent',
        }
        actionService.loadFromFiles([{ content: JSON.stringify(actionDefinition), path }])
        renderTextView()
        clickTreeFile('Review code')

        act(() => actionService.loadFromFiles([{
            content: JSON.stringify({ ...actionDefinition, label: 'Review updated' }),
            path,
        }]))

        clickTreeFile('Review updated')

        expect(openFilesService.getSnapshot().documents).toHaveLength(1)
        expect(openFilesService.getSnapshot().documents[0].getObject()).toMatchObject({ label: 'Review updated' })
    }, 10_000)

    it('focuses the existing tab instead of duplicating when a file is reopened', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')
        clickTreeFile('F-2 Beta')
        clickTreeFile('F-1 Alpha')

        expect(screen.getAllByRole('tab', { name: /Alpha/ })).toHaveLength(1)
        expect(screen.getByDisplayValue(/Body A/)).toBeInTheDocument()
    })

    it('reuses one markdown editor while switching between card documents', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')
        const alphaEditor = screen.getAllByTestId('mdx-editor')[1]

        clickTreeFile('F-2 Beta')
        const betaEditor = screen.getAllByTestId('mdx-editor')[1]
        expect(betaEditor).toBe(alphaEditor)
        expect(screen.getByDisplayValue(/Body B/)).toBeInTheDocument()

        fireEvent.click(screen.getByRole('tab', { name: /Alpha/ }))

        expect(screen.getAllByTestId('mdx-editor')[1]).toBe(alphaEditor)
        expect(screen.getByDisplayValue(/Body A/)).toBeInTheDocument()
    })

    it('keeps separate card and action Markdown editors mounted across tab switches', () => {
        loadMarkdownActions()
        renderTextView()

        const editors = screen.getAllByTestId('mdx-editor')
        expect(editors).toHaveLength(2)
        const [actionEditor, cardEditor] = editors

        clickTreeFile('F-1 Alpha')
        expect(screen.getAllByTestId('mdx-editor')[1]).toBe(cardEditor)
        clickTreeFile('Review')
        expect(screen.getAllByTestId('mdx-editor')[0]).toBe(actionEditor)

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        expect(screen.getAllByTestId('mdx-editor')[0]).toBe(actionEditor)
        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))
        expect(screen.getAllByTestId('mdx-editor')[0]).toBe(actionEditor)
        fireEvent.click(screen.getByRole('tab', { name: 'Lint' }))
        expect(screen.getAllByTestId('mdx-editor')[0]).toBe(actionEditor)

        clickTreeFile('Summarize')
        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        expect(screen.getAllByTestId('mdx-editor')[0]).toBe(actionEditor)
        clickTreeFile('F-2 Beta')
        expect(screen.getAllByTestId('mdx-editor')[1]).toBe(cardEditor)
        expect(screen.getAllByTestId('mdx-editor')).toHaveLength(2)
    }, 10_000)

    it('flushes each shared Markdown document through its owning save callback', () => {
        loadMarkdownActions()
        renderTextView()

        clickTreeFile('F-1 Alpha')
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited card' } })
        clickTreeFile('Review')
        expect(cardMarkdownDataSource.commit).toHaveBeenCalledExactlyOnceWith(
            'list-card', expect.objectContaining({ document: expect.any(Object) }), 'Edited card',
        )

        fireEvent.click(screen.getByRole('tab', { name: 'Prompt' }))
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited prompt' } })
        fireEvent.click(screen.getByRole('tab', { name: 'Tests' }))
        expect(actionService.getDraft('design/actions/review.json').definition.prompt).toBe('Edited prompt')

        const phraseEditor = within(screen.getAllByTestId('mdx-editor')[0]).getAllByRole('textbox')[1]
        fireEvent.change(phraseEditor, { target: { value: 'Edited phrase' } })
        fireEvent.click(screen.getByRole('tab', { name: 'Lint' }))
        expect(actionService.getDraft('design/actions/review.json').definition.phrases?.[0].text).toBe('Edited phrase')
    }, 10_000)

    it('hides rather than unmounts the shared editor for empty, Definition, and command states', () => {
        loadMarkdownActions()
        renderTextView()

        const actionEditor = screen.getAllByTestId('mdx-editor')[0]

        clickTreeFile('Review')
        expect(screen.getAllByTestId('mdx-editor')[0]).toBe(actionEditor)

        clickTreeFile('Test')
        expect(screen.getAllByTestId('mdx-editor')[0]).toBe(actionEditor)
    })

    it('closes a tab from the tab bar', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')
        clickTreeFile('F-2 Beta')
        fireEvent.click(screen.getByRole('button', { name: 'Close F-1 Alpha' }))

        expect(screen.queryByRole('tab', { name: /Alpha/ })).not.toBeInTheDocument()
        expect(screen.getByRole('tab', { name: /Beta/ })).toBeInTheDocument()
    })

    it('does not save an untouched file when its tab closes', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')
        fireEvent.click(screen.getByRole('button', { name: 'Close F-1 Alpha' }))

        expect(cardMarkdownDataSource.commit).not.toHaveBeenCalled()
    })

    it('confirms tree deletion and closes the matching open tab after success', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
        renderTextView()

        clickTreeFile('F-1 Alpha')
        fireEvent.click(screen.getByRole('button', { name: 'Delete design/active/F-1-a.md' }))

        expect(confirm).toHaveBeenCalledWith(expect.stringContaining('design/active/F-1-a.md'))
        expect(dataService.cards.deleteFile).toHaveBeenCalledWith('design/active/F-1-a.md')

        confirm.mockRestore()
    })

    it('deletes a user folder recursively from its trash icon after confirmation', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
        const nestedCard = card('design/notes/nested.md', { title: 'Nested' }, '# Nested')
        renderTextView({}, activeCards, [...backgroundCards, nestedCard], ['design/notes/.gitkeep', nestedCard.path])

        clickTreeFile('Nested')
        fireEvent.click(screen.getByRole('button', { name: 'Delete design/notes' }))

        expect(confirm).toHaveBeenCalledWith('Delete design/notes and all files inside it?')
        expect(dataService.cards.deleteFolder).toHaveBeenCalledWith('design/notes')
        expect(screen.queryByRole('button', { name: 'Delete design/history' })).not.toBeInTheDocument()

        confirm.mockRestore()
    })

    it('offers recursive user-folder deletion in the context menu', async () => {
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
        renderTextView({}, activeCards, backgroundCards, ['design/notes/.gitkeep'])
        const tree = within(screen.getByLabelText('File tree'))

        fireEvent.contextMenu(tree.getByRole('button', { name: 'notes 0' }))
        fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Delete folder' }))

        await waitFor(() => expect(dataService.cards.deleteFolder).toHaveBeenCalledWith('design/notes'))
        expect(confirm).toHaveBeenCalledWith('Delete design/notes and all files inside it?')

        confirm.mockRestore()
    })

    it('persists an edit exactly once when another file is opened', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Edited body' } })
        expect(cardMarkdownDataSource.commit).not.toHaveBeenCalled()
        clickTreeFile('F-2 Beta')

        expect(cardMarkdownDataSource.commit).toHaveBeenCalledExactlyOnceWith(
            'list-card', expect.objectContaining({ document: expect.any(Object) }), 'Edited body',
        )
    })

    it('mounts only the final editor after rapid switching and preserves its pending edit', () => {
        renderTextView()
        const tree = within(screen.getByLabelText('File tree'))
        const alphaButton = tree.getByRole('button', { name: 'F-1 Alpha' })
        const betaButton = tree.getByRole('button', { name: 'F-2 Beta' })

        act(() => {
            alphaButton.click()
            betaButton.click()
            alphaButton.click()
        })

        expect(screen.getAllByTestId('mdx-editor')).toHaveLength(2)
        expect(screen.getByDisplayValue(/Body A/)).toBeInTheDocument()
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Rapid edit' } })
        fireEvent.click(screen.getByRole('tab', { name: /Beta/ }))

        expect(cardMarkdownDataSource.commit).toHaveBeenCalledExactlyOnceWith(
            'list-card', expect.objectContaining({ document: expect.any(Object) }), 'Rapid edit',
        )
    })

    it('closes a clean action tab after external deletion', async () => {
        vi.spyOn(dataService, 'hasPendingFile').mockReturnValue(false)
        vi.spyOn(dataService, 'discardPendingFile').mockImplementation(() => undefined)
        loadReviewAction()
        renderTextView()
        clickTreeFile('Review')

        act(() => actionService.reloadFromFiles([], [{ origin: 'external', path: 'design/actions/review.json' }]))

        await waitFor(() => expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument())
        expect(screen.getByText('Select a file from the tree to open it.')).toBeInTheDocument()
    })

    it('keeps a dirty deleted action recoverable and recreates it explicitly', async () => {
        vi.spyOn(dataService, 'hasPendingFile').mockReturnValue(false)
        vi.spyOn(dataService, 'discardPendingFile').mockImplementation(() => undefined)
        const persistActionFile = vi.spyOn(dataService, 'persistActionFile').mockResolvedValue()
        loadReviewAction()
        renderTextView()
        clickTreeFile('Review')
        fireEvent.change(screen.getByLabelText('Label'), { target: { value: '' } })
        fireEvent.blur(screen.getByLabelText('Label'))

        act(() => actionService.reloadFromFiles([], [{ origin: 'external', path: 'design/actions/review.json' }]))

        expect(screen.getByText(/action file was deleted outside the editor/u)).toBeInTheDocument()
        expect(screen.getByLabelText('Label')).toHaveValue('')
        expect(screen.getByRole('button', { name: 'Recreate file' })).toBeDisabled()

        fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Recovered' } })
        fireEvent.blur(screen.getByLabelText('Label'))
        fireEvent.click(screen.getByRole('button', { name: 'Recreate file' }))

        await waitFor(() => expect(persistActionFile).toHaveBeenCalledWith(
            expect.objectContaining({path: 'design/actions/recovered.json'}),
            'design/actions/review.json',
            expect.any(Function),
            false,
            expect.any(Object),
            expect.any(Function),
        ))
        await waitFor(() => expect(screen.queryByText(/action file was deleted outside the editor/u)).not.toBeInTheDocument())
        expect(openFilesService.getSnapshot().activeDocument?.getObject()).toMatchObject({ label: 'Recovered' })
    })

    it('discards a dirty deleted action and closes its tab', async () => {
        vi.spyOn(dataService, 'hasPendingFile').mockReturnValue(false)
        vi.spyOn(dataService, 'discardPendingFile').mockImplementation(() => undefined)
        const persistActionFile = vi.spyOn(dataService, 'persistActionFile').mockResolvedValue()
        loadReviewAction()
        renderTextView()
        clickTreeFile('Review')
        fireEvent.change(screen.getByLabelText('Label'), { target: { value: '' } })
        fireEvent.blur(screen.getByLabelText('Label'))
        act(() => actionService.reloadFromFiles([], [{ origin: 'external', path: 'design/actions/review.json' }]))

        fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))

        await waitFor(() => expect(screen.queryByRole('tab', { name: 'Review' })).not.toBeInTheDocument())
        expect(persistActionFile).not.toHaveBeenCalled()
    })

    it('updates the left-panel tree when cards change without a view-mode switch', () => {
        setProjectCards([activeCards[0]], [])
        const statusColors = new Map(
            DEFAULT_STATES.map(({ color, state }, index) => [state, color ?? defaultColumnAccent(index)]),
        )
        render(
            <AppThemeProvider>
                <div aria-label="File tree">
                    <FileTreeView
                        actionsFolder="design/actions"
                        cardTypes={DEFAULT_CARD_TYPES}
                        onCreateFolder={vi.fn()}
                        onCreateMarkdownFile={vi.fn()}
                        onDeleteFile={vi.fn()}
                        onDeleteFolder={vi.fn()}
                        onLeftPanelInteraction={vi.fn()}
                        projectFolder="design"
                        statusColors={statusColors}
                        workingFolder="design/active"
                    />
                </div>
            </AppThemeProvider>,
        )

        expect(within(screen.getByLabelText('File tree')).getByRole('button', { name: 'F-1 Alpha' })).toBeInTheDocument()
        expect(within(screen.getByLabelText('File tree')).queryByRole('button', { name: 'F-2 Beta' })).toBeNull()

        act(() => {
            setProjectCards(activeCards, [])
            dataService.dispatchEvent(new Event('changed'))
        })

        expect(within(screen.getByLabelText('File tree')).getByRole('button', { name: 'F-2 Beta' })).toBeInTheDocument()
    })

    it('publishes the tree as left-panel content on mobile', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')

        expect(screen.getByDisplayValue(/Body A/)).toBeInTheDocument()
    })

    it('keeps the formatting toolbar sticky above the editor on mobile', () => {
        renderTextView()
        clickTreeFile('F-1 Alpha')

        expect(document.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
    })

    it('pins the formatting toolbar above the document on desktop', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')

        expect(document.querySelector('[data-sticky-toolbar="true"]')).not.toBeNull()
    })

    it('opens the standard action popup without an anchor from the editor toolbar', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')

        const editorToolbar = within(screen.getAllByTestId('mdx-editor-toolbar')[1])
        fireEvent.click(editorToolbar.getByRole('button', { name: 'Agents' }))

        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))
        expect(dialog.getByRole('button', { name: 'Custom prompt' })).toHaveAttribute('aria-pressed', 'true')
        expect(dialog.getByRole('button', { name: 'Schedule' })).toBeInTheDocument()
        expect(dialog.getByRole('button', { name: 'Run' })).toBeInTheDocument()
        expect(screen.queryByText('No agent conversations.')).not.toBeInTheDocument()
        expect(screen.getByRole('dialog', { name: 'Run actions' })).toHaveStyle({ position: 'fixed' })
    })

    it('publishes the desktop tree without a Browse files button', () => {
        renderTextView()

        expect(screen.queryByRole('button', { name: /Browse files/ })).not.toBeInTheDocument()
        expect(within(screen.getByLabelText('File tree')).getByRole('button', { name: 'F-1 Alpha' })).toBeInTheDocument()
    })


    it('opens Properties from the toolbar for a card with frontmatter', () => {
        const cardWithHeader = { ...activeCards[0], headerFields: { id: 'F-1', status: 'todo', title: 'Alpha' } }
        renderTextView({}, [cardWithHeader, activeCards[1]])

        clickTreeFile('F-1 Alpha')

        expect(screen.queryByRole('dialog', { name: 'Card properties popup' })).not.toBeInTheDocument()
        fireEvent.click(within(screen.getAllByTestId('mdx-editor-toolbar')[1]).getByRole('button', { name: 'Properties' }))

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
        const updateAuthor = vi.spyOn(cardMarkdownDataSource, 'updateActiveCardHeaderField').mockImplementation(() => undefined)
        const updateTitle = vi.spyOn(cardMarkdownDataSource, 'updateActiveCardTitle').mockImplementation(() => undefined)
        const togglePolicy = vi.spyOn(cardMarkdownDataSource, 'toggleActiveCardPolicy').mockImplementation(() => undefined)
        renderTextView({}, [cardWithHeader, activeCards[1]])
        clickTreeFile('F-1 Alpha')
        fireEvent.click(within(screen.getAllByTestId('mdx-editor-toolbar')[1]).getByRole('button', { name: 'Properties' }))

        fireEvent.change(screen.getByLabelText('Card title'), { target: { value: 'Renamed' } })
        fireEvent.blur(screen.getByLabelText('Card title'))
        fireEvent.change(screen.getByLabelText('Card author'), { target: { value: 'AB' } })
        fireEvent.blur(screen.getByLabelText('Card author'))
        fireEvent.mouseDown(screen.getByLabelText('Card policy'))
        fireEvent.click(screen.getByRole('option', { name: 'Auto-merge' }))

        expect(updateTitle).toHaveBeenCalledWith('list-card', 'Renamed')
        expect(updateAuthor).toHaveBeenCalledWith('list-card', 'author', 'AB')
        expect(togglePolicy).toHaveBeenCalledWith('list-card', 'autoMerge')
    })

    it('renders no Properties toolbar button for files without frontmatter', () => {
        renderTextView()

        clickTreeFile('F-1 Alpha')

        expect(within(screen.getAllByTestId('mdx-editor-toolbar')[1]).queryByRole('button', { name: 'Properties' })).not.toBeInTheDocument()
    })
})
