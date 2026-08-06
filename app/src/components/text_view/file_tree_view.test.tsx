import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../../data/file_tree'
import type { Card } from '../../data/data_types'
import { dataService } from '../../services/data/data_service'
import { openFilesService } from '../../services/open_files_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { FileTreeView } from './file_tree_view'

function fileNode(index: number, directoryPath = 'design'): TreeNode {
    const path = `${directoryPath}/F-${index}.md`

    return { children: [], directoryPath, id: path, kind: 'file', label: `File ${index}`, path, status: null }
}

function Card(path: string, title: string): Card {
    return {
        agentConversationErrors: [], agentConversations: [], content: '', hasFrontmatter: true, isActive: true, path,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: 'F-0', internalId: path,
            owner: null, policy: {}, status: null, title,
        },
    }
}

function filePaths(nodes: TreeNode[]): string[] {
    return nodes.flatMap((node) => node.path ? [node.path] : filePaths(node.children))
}

function renderTree(nodes: TreeNode[]) {
    const cards = filePaths(nodes).map((path) => {
        const index = Number(path.match(/F-(\d+)/u)?.[1] ?? 0)

        return Card(path, `File ${index}`)
    })
    const activeCards = nodes.every((node) => node.kind === 'file') ? cards : []
    const backgroundCards = activeCards.length > 0 ? [] : cards
    vi.spyOn(dataService, 'getState').mockReturnValue({
        project: null,
        runningAgents: [],
        snapshot: { activeCards, backgroundCards, repositoryFiles: [], workingFolder: 'design' },
    })
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
                workingFolder="design"
            />
        </AppThemeProvider>,
    )
}

describe('FileTreeView', () => {
    afterEach(() => {
        cleanup()
        openFilesService.clear()
        vi.restoreAllMocks()
    })

    it('opens branches by default, toggles them, and activates file leaves', () => {
        const child = fileNode(1, 'design/folder')
        const folder: TreeNode = {children: [child], directoryPath: 'design/folder', id: 'folder', kind: 'folder', label: 'Folder', path: null, status: null}
        renderTree([folder])

        expect(screen.getByText('File 1')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'folder 1' }))
        expect(screen.queryByText('File 1')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'folder 1' }))
        fireEvent.click(screen.getByRole('button', { name: 'File 1' }))
        const activeDocument = openFilesService.getSnapshot().activeDocument
        expect(activeDocument?.kind).toBe('card')
        if (activeDocument?.kind !== 'card') throw new Error('Expected an active card document')
        expect(activeDocument.getObject().path).toBe('design/folder/F-1.md')
    })

    it('only mounts the rows inside the virtualized viewport', () => {
        const nodes = Array.from({ length: 100 }, (_, index) => fileNode(index))
        renderTree(nodes)

        expect(screen.getByText('File 0')).toBeInTheDocument()
        expect(screen.queryByText('File 99')).not.toBeInTheDocument()
        expect(screen.getByRole('tree')).toBeInTheDocument()
    })

    it('moves the active highlight when the active document changes', () => {
        const nodes = [fileNode(1), fileNode(2)]
        renderTree(nodes)

        act(() => openFilesService.openDocument(Card(nodes[0].path!, 'File 1')))

        expect(screen.getByRole('button', { name: 'File 1' }).parentElement).toHaveAttribute('data-selected', 'true')
        expect(screen.getByRole('button', { name: 'File 2' }).parentElement).not.toHaveAttribute('data-selected')

        act(() => openFilesService.openDocument(Card(nodes[1].path!, 'File 2')))

        expect(screen.getByRole('button', { name: 'File 1' }).parentElement).not.toHaveAttribute('data-selected')
        expect(screen.getByRole('button', { name: 'File 2' }).parentElement).toHaveAttribute('data-selected', 'true')
    })

    it('constrains rows to the tree viewport', () => {
        renderTree([fileNode(1)])

        const fileButton = screen.getByRole('button', { name: 'File 1' })
        const fileTreeItem = fileButton.closest<HTMLElement>('[role="treeitem"]')
        if (!fileTreeItem) throw new Error('Missing file tree item')

        expect(fileTreeItem).toHaveStyle({ maxWidth: '100%', minWidth: 0, overflow: 'hidden' })
        expect(fileButton.parentElement).toHaveStyle({ cursor: 'pointer' })
        expect(within(fileTreeItem).getByRole('button', { name: 'Actions' }).parentElement).toHaveStyle({ position: 'absolute' })
    })
})
