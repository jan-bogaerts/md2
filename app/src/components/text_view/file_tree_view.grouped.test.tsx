import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Card, ProjectSnapshot } from '../../data/data_types'
import { dataService, type DataServiceState } from '../../services/data/data_service'
import { openFilesService } from '../../services/open_files_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { FileTreeView } from './file_tree_view'

function card(path: string, title: string, status: string | null = null): Card {
    return {
        agentConversationErrors: [], agentConversations: [], content: '', hasFrontmatter: true, isActive: true, path,
        header: {
            affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id: 'F-0', internalId: path,
            owner: null, policy: {}, references: [], status, title,
        },
    }
}

function snapshot(activeCards: Card[], backgroundCards: Card[] = [], repositoryFiles: string[] = [], workingFolder = 'design'): ProjectSnapshot {
    return { activeCards, backgroundCards, repositoryFiles, workingFolder }
}

function renderTree(initialSnapshot: ProjectSnapshot | null, workingFolder = initialSnapshot?.workingFolder ?? 'design') {
    let state: DataServiceState = {
        project: null,
        runningAgents: [],
        snapshot: initialSnapshot,
    }
    vi.spyOn(dataService, 'getState').mockImplementation(() => state)
    render(
        <AppThemeProvider>
            <FileTreeView
                actionsFolder="design/actions"
                cardTypes={[]}
                onCreateFolder={async () => undefined}
                onCreateMarkdownFile={async () => undefined}
                onDeleteFile={async () => undefined}
                onDeleteFolder={async () => undefined}
                onLeftPanelInteraction={vi.fn()}
                projectFolder="design"
                statusColors={new Map()}
                workingFolder={workingFolder}
            />
        </AppThemeProvider>,
    )

    return {
        updateSnapshot(nextSnapshot: ProjectSnapshot) {
            state = { ...state, snapshot: nextSnapshot }
            act(() => dataService.dispatchEvent(new Event('changed')))
        },
    }
}

function treeItemForButton(name: string): HTMLElement {
    const treeItem = screen.getByRole('button', { name }).closest<HTMLElement>('[role="treeitem"]')
    if (!treeItem) throw new Error(`Missing tree item for ${name}`)

    return treeItem
}

describe('FileTreeView', () => {
    afterEach(() => {
        cleanup()
        openFilesService.clear()
        vi.restoreAllMocks()
    })

    it('starts status groups open and regular and special folders closed', () => {
        renderTree(snapshot(
            [card('design/F-1.md', 'Active', 'todo')],
            [card('design/folder/F-2.md', 'Regular'), card('design/actions/F-3.md', 'Special')],
        ))

        expect(treeItemForButton('todo 1')).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument()
        expect(treeItemForButton('folder 1')).toHaveAttribute('aria-expanded', 'false')
        expect(treeItemForButton('actions 1')).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('button', { name: 'Regular' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Special' })).not.toBeInTheDocument()
    })

    it('reveals open status groups after the collapsed working folder is opened', () => {
        renderTree(snapshot([card('design/active/F-1.md', 'Active', 'todo')], [], [], 'design/active'))

        expect(treeItemForButton('active 1')).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('button', { name: 'todo 1' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'active 1' }))

        expect(treeItemForButton('todo 1')).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'todo 1' }))
        expect(screen.queryByRole('button', { name: 'Active' })).not.toBeInTheDocument()
    })

    it('toggles folders and activates file leaves', () => {
        renderTree(snapshot([], [card('design/folder/F-1.md', 'File 1')]))

        expect(screen.queryByText('File 1')).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'folder 1' }))
        expect(screen.getByText('File 1')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'File 1' }))
        const activeDocument = openFilesService.getSnapshot().activeDocument
        expect(activeDocument?.kind).toBe('card')
        if (activeDocument?.kind !== 'card') throw new Error('Expected an active card document')
        expect(activeDocument.getObject().path).toBe('design/folder/F-1.md')
    })

    it('uses 28px rows with 4px top and bottom tree padding', () => {
        renderTree(snapshot([card('design/F-1.md', 'File 1', 'todo')]))

        const statusTreeItem = treeItemForButton('todo 1')
        const fileTreeItem = treeItemForButton('File 1')
        const treeViewport = screen.getByRole('tree').firstElementChild
        const treeContent = treeViewport?.lastElementChild

        expect(statusTreeItem).toHaveStyle({ height: '28px', top: '4px' })
        expect(fileTreeItem).toHaveStyle({ height: '28px', top: '32px' })
        expect(treeContent).toHaveStyle({ height: '64px' })
    })

    it('keeps user branch state after a project snapshot rebuild', () => {
        const initialSnapshot = snapshot(
            [card('design/F-1.md', 'Active', 'todo')],
            [card('design/folder/F-2.md', 'Regular')],
        )
        const tree = renderTree(initialSnapshot)
        fireEvent.click(screen.getByRole('button', { name: 'folder 1' }))
        fireEvent.click(screen.getByRole('button', { name: 'todo 1' }))

        tree.updateSnapshot(snapshot(
            [card('design/F-1.md', 'Active updated', 'todo')],
            [card('design/folder/F-2.md', 'Regular updated')],
        ))

        expect(treeItemForButton('folder 1')).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('button', { name: 'Regular updated' })).toBeInTheDocument()
        expect(treeItemForButton('todo 1')).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('button', { name: 'Active updated' })).not.toBeInTheDocument()
    })

    it('applies branch defaults when an initially empty tree first receives nodes', () => {
        const tree = renderTree(null, 'design/active')

        tree.updateSnapshot(snapshot([card('design/active/F-1.md', 'Active', 'todo')], [], [], 'design/active'))
        fireEvent.click(screen.getByRole('button', { name: 'active 1' }))

        expect(treeItemForButton('todo 1')).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('button', { name: 'Active' })).toBeInTheDocument()
    })

    it('only mounts the rows inside the virtualized viewport', () => {
        const cards = Array.from({ length: 100 }, (_, index) => card(`design/F-${index}.md`, `File ${index}`, 'todo'))
        renderTree(snapshot(cards))

        expect(screen.getByText('File 0')).toBeInTheDocument()
        expect(screen.queryByText('File 99')).not.toBeInTheDocument()
        expect(screen.getByRole('tree')).toBeInTheDocument()
    })

    it('moves the active highlight when the active document changes', () => {
        const cards = [card('design/F-1.md', 'File 1', 'todo'), card('design/F-2.md', 'File 2', 'todo')]
        renderTree(snapshot(cards))

        act(() => openFilesService.openDocument(cards[0]))

        expect(screen.getByRole('button', { name: 'File 1' }).parentElement).toHaveAttribute('data-selected', 'true')
        expect(screen.getByRole('button', { name: 'File 2' }).parentElement).not.toHaveAttribute('data-selected')

        act(() => openFilesService.openDocument(cards[1]))

        expect(screen.getByRole('button', { name: 'File 1' }).parentElement).not.toHaveAttribute('data-selected')
        expect(screen.getByRole('button', { name: 'File 2' }).parentElement).toHaveAttribute('data-selected', 'true')
    })

    it('constrains rows to the tree viewport', () => {
        renderTree(snapshot([card('design/F-1.md', 'File 1', 'todo')]))

        const fileButton = screen.getByRole('button', { name: 'File 1' })
        const fileTreeItem = fileButton.closest<HTMLElement>('[role="treeitem"]')
        if (!fileTreeItem) throw new Error('Missing file tree item')

        expect(fileTreeItem).toHaveStyle({ maxWidth: '100%', minWidth: 0, overflow: 'hidden' })
        expect(fileButton.parentElement).toHaveStyle({ cursor: 'pointer' })
        expect(within(fileTreeItem).getByRole('button', { name: 'Actions' }).parentElement).toHaveStyle({ position: 'absolute' })
    })
})
