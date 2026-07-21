import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../../data/file_tree'
import type { ProjectCard } from '../../data/data_types'
import { openFilesService } from '../../services/open_files_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { FileTreeView } from './file_tree_view'

function fileNode(index: number, directoryPath = 'design'): TreeNode {
    const path = `${directoryPath}/F-${index}.md`

    return { children: [], directoryPath, id: path, kind: 'file', label: `File ${index}`, path }
}

function projectCard(path: string): ProjectCard {
    return {
        agentConversationErrors: [], agentConversations: [], content: '', headerFields: {}, isActive: true, path,
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, status: null, title: path,
        },
    }
}

function filePaths(nodes: TreeNode[]): string[] {
    return nodes.flatMap((node) => node.path ? [node.path] : filePaths(node.children))
}

function renderTree(nodes: TreeNode[]) {
    const cardsByPath = new Map(filePaths(nodes).map((path) => [path, projectCard(path)]))
    render(
        <AppThemeProvider>
            <FileTreeView
                cardTypes={[]}
                cardsByPath={cardsByPath}
                nodes={nodes}
                objectsByPath={cardsByPath}
                onCreateFolder={async () => undefined}
                onCreateMarkdownFile={async () => undefined}
                onDeleteFile={async () => undefined}
                onDeleteFolder={async () => undefined}
                onLeftPanelInteraction={vi.fn()}
                projectFolder="design"
                statusColors={new Map()}
            />
        </AppThemeProvider>,
    )
}

describe('FileTreeView', () => {
    afterEach(() => {
        cleanup()
        openFilesService.clear()
    })

    it('opens branches by default, toggles them, and activates file leaves', () => {
        const child = fileNode(1, 'design/folder')
        const folder: TreeNode = {children: [child], directoryPath: 'design/folder', id: 'folder', kind: 'folder', label: 'Folder', path: null}
        renderTree([folder])

        expect(screen.getByText('File 1')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Folder 1' }))
        expect(screen.queryByText('File 1')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Folder 1' }))
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

        act(() => openFilesService.openDocument(projectCard(nodes[0].path!)))

        expect(screen.getByRole('button', { name: 'File 1' }).parentElement).toHaveAttribute('data-selected', 'true')
        expect(screen.getByRole('button', { name: 'File 2' }).parentElement).not.toHaveAttribute('data-selected')

        act(() => openFilesService.openDocument(projectCard(nodes[1].path!)))

        expect(screen.getByRole('button', { name: 'File 1' }).parentElement).not.toHaveAttribute('data-selected')
        expect(screen.getByRole('button', { name: 'File 2' }).parentElement).toHaveAttribute('data-selected', 'true')
    })

    it('constrains rows to the tree viewport', () => {
        renderTree([fileNode(1)])

        expect(screen.getByRole('treeitem')).toHaveStyle({ maxWidth: '100%', minWidth: 0, overflow: 'hidden' })
        expect(screen.getByRole('button', { name: 'File 1' }).parentElement).toHaveStyle({ cursor: 'pointer' })
        expect(screen.getByRole('button', { name: 'Actions' }).parentElement).toHaveStyle({ position: 'absolute' })
    })
})
