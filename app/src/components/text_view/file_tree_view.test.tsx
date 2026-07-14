import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../../data/file_tree'
import { AppThemeProvider } from '../../theme/theme_provider'
import { FileTreeView } from './file_tree_view'

function fileNode(index: number, directoryPath = 'design'): TreeNode {
    const path = `${directoryPath}/F-${index}.md`

    return { children: [], directoryPath, id: path, kind: 'file', label: `File ${index}`, path }
}

function renderTree(nodes: TreeNode[], onSelect = vi.fn()) {
    render(
        <AppThemeProvider>
            <FileTreeView
                cardTypes={[]}
                cardsByPath={new Map()}
                nodes={nodes}
                onCreateFolder={async () => undefined}
                onCreateMarkdownFile={async () => undefined}
                onDeleteFile={async () => undefined}
                onDeleteFolder={async () => undefined}
                onSelect={onSelect}
                projectFolder="design"
                selectedPath={null}
                statusColors={new Map()}
            />
        </AppThemeProvider>,
    )
}

describe('FileTreeView', () => {
    afterEach(cleanup)

    it('opens branches by default, toggles them, and activates file leaves', () => {
        const child = fileNode(1, 'design/folder')
        const folder: TreeNode = {children: [child], directoryPath: 'design/folder', id: 'folder', kind: 'folder', label: 'Folder', path: null}
        const onSelect = vi.fn()
        renderTree([folder], onSelect)

        expect(screen.getByText('File 1')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Folder 1' }))
        expect(screen.queryByText('File 1')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Folder 1' }))
        fireEvent.click(screen.getByRole('button', { name: 'File 1' }))
        expect(onSelect).toHaveBeenCalledWith('design/folder/F-1.md')
    })

    it('only mounts the rows inside the virtualized viewport', () => {
        const nodes = Array.from({ length: 100 }, (_, index) => fileNode(index))
        renderTree(nodes)

        expect(screen.getByText('File 0')).toBeInTheDocument()
        expect(screen.queryByText('File 99')).not.toBeInTheDocument()
        expect(screen.getByRole('tree')).toBeInTheDocument()
    })
})
