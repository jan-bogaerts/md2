import { describe, expect, it } from 'vitest'
import { buildFileTree, fileLabel, type FileTreeOptions, type TreeNode } from './file_tree'
import type { ProjectCard } from './data_types'

function card(path: string, overrides: Partial<ProjectCard['header']> = {}): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        headerFields: {},
        content: '',
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

function findChild(nodes: TreeNode[], label: string): TreeNode | undefined {
    return nodes.find((node) => node.label === label)
}

function treeOptions(overrides: Partial<FileTreeOptions> = {}): FileTreeOptions {
    return {
        projectFolder: 'design',
        repositoryFiles: [],
        specialFolderPaths: ['design/actions', 'design/active', 'design/history'],
        ...overrides,
    }
}

describe('buildFileTree', () => {
    it('groups active cards into a status node per distinct status', () => {
        const active = [
            card('design/active/F-1-a.md', { id: 'F-1', title: 'Alpha', status: 'todo' }),
            card('design/active/F-2-b.md', { id: 'F-2', title: 'Beta', status: 'done' }),
            card('design/active/F-3-c.md', { id: 'F-3', title: 'Gamma', status: 'todo' }),
        ]

        const tree = buildFileTree(active, [], 'design/active', treeOptions())

        const workingFolder = findChild(tree, 'active')
        const todo = findChild(workingFolder?.children ?? [], 'todo')
        const done = findChild(workingFolder?.children ?? [], 'done')
        expect(workingFolder?.kind).toBe('special')
        expect(todo?.kind).toBe('status')
        expect(todo?.directoryPath).toBe('design')
        expect(todo?.children.map((child) => child.label)).toEqual(['F-1 Alpha', 'F-3 Gamma'])
        expect(done?.children.map((child) => child.path)).toEqual(['design/active/F-2-b.md'])
        expect(done?.children[0].directoryPath).toBe('design')
    })

    it('labels a status node with no status as Unassigned', () => {
        const tree = buildFileTree(
            [card('design/active/F-9-x.md', { id: 'F-9', title: 'Nine' })],
            [],
            'design/active',
            treeOptions(),
        )
        const workingFolder = findChild(tree, 'active')

        expect(findChild(workingFolder?.children ?? [], 'Unassigned')?.kind).toBe('status')
    })

    it('nests background files into regular folders under the project folder', () => {
        const background = [card('design/notes/deep/thoughts.md', { title: 'Untitled' })]

        const tree = buildFileTree([], background, 'design/active', treeOptions())

        const notes = findChild(tree, 'notes')
        expect(notes?.kind).toBe('folder')
        const deep = findChild(notes?.children ?? [], 'deep')
        expect(deep?.kind).toBe('folder')
        expect(deep?.children[0]).toMatchObject({ kind: 'file', label: 'thoughts.md', path: 'design/notes/deep/thoughts.md' })
    })

    it('marks configured top-level folders as special', () => {
        const background = [
            card('design/history/rel1/F-2-old.md', { id: 'F-2', title: 'Old' }),
            card('design/actions/prompt.md', { title: 'Untitled' }),
            card('design/architecture/data.md', { title: 'Untitled' }),
            card('design/notes/plain.md', { title: 'Untitled' }),
        ]

        const tree = buildFileTree([], background, 'design/active', treeOptions())

        expect(findChild(tree, 'history')?.kind).toBe('special')
        expect(findChild(tree, 'actions')?.kind).toBe('special')
        expect(findChild(tree, 'active')?.kind).toBe('special')
        expect(findChild(tree, 'architecture')?.kind).toBe('folder')
        expect(findChild(tree, 'notes')?.kind).toBe('folder')
    })

    it('honors a custom special-folder list', () => {
        const background = [card('design/history/x.md'), card('design/vault/y.md')]

        const tree = buildFileTree([], background, 'design/active', treeOptions({ specialFolderPaths: ['design/vault'] }))

        expect(findChild(tree, 'history')?.kind).toBe('folder')
        expect(findChild(tree, 'vault')?.kind).toBe('special')
    })

    it('places status groups before real subfolders inside the working folder', () => {
        const tree = buildFileTree(
            [card('design/active/F-1-a.md', { id: 'F-1', title: 'Alpha', status: 'todo' })],
            [card('design/active/notes/old.md')],
            'design/active',
            treeOptions(),
        )
        const workingFolder = findChild(tree, 'active')

        expect(workingFolder?.children.map((node) => node.kind)).toEqual(['status', 'folder'])
    })

    it('includes folders represented by repository files without Markdown cards', () => {
        const tree = buildFileTree([], [], 'design/active', treeOptions({repositoryFiles: ['app/src/app.tsx', 'design/empty/.gitkeep', 'design/assets/image.png']}))

        expect(findChild(tree, 'empty')).toMatchObject({ directoryPath: 'design/empty', kind: 'folder' })
        expect(findChild(tree, 'assets')).toMatchObject({ directoryPath: 'design/assets', kind: 'folder' })
        expect(findChild(tree, 'app')).toBeUndefined()
    })
})

describe('fileLabel', () => {
    it('prefers id and title when both are meaningful', () => {
        expect(fileLabel(card('design/F-1-a.md', { id: 'F-1', title: 'Alpha' }))).toBe('F-1 Alpha')
    })

    it('falls back to the file name when the title is untitled', () => {
        expect(fileLabel(card('design/history/notes.md', { id: 'F-0', title: 'Untitled' }))).toBe('notes.md')
    })

    it('uses the title alone when the id is the imported default', () => {
        expect(fileLabel(card('design/architecture/data.md', { id: 'F-0', title: 'Data' }))).toBe('Data')
    })
})
