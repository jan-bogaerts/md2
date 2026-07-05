import { describe, expect, it } from 'vitest'
import { buildFileTree, fileLabel, type TreeNode } from './file_tree'
import type { ProjectCard } from './data_types'

function card(path: string, overrides: Partial<ProjectCard['header']> = {}): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
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

describe('buildFileTree', () => {
    it('groups active cards into a status node per distinct status', () => {
        const active = [
            card('design/F-1-a.md', { id: 'F-1', title: 'Alpha', status: 'todo' }),
            card('design/F-2-b.md', { id: 'F-2', title: 'Beta', status: 'done' }),
            card('design/F-3-c.md', { id: 'F-3', title: 'Gamma', status: 'todo' }),
        ]

        const tree = buildFileTree(active, [], 'design')

        const todo = findChild(tree, 'todo')
        const done = findChild(tree, 'done')
        expect(todo?.kind).toBe('status')
        expect(todo?.children.map((child) => child.label)).toEqual(['F-1 Alpha', 'F-3 Gamma'])
        expect(done?.children.map((child) => child.path)).toEqual(['design/F-2-b.md'])
    })

    it('labels a status node with no status as Unassigned', () => {
        const tree = buildFileTree([card('design/F-9-x.md', { id: 'F-9', title: 'Nine' })], [], 'design')

        expect(findChild(tree, 'Unassigned')?.kind).toBe('status')
    })

    it('nests background files into real subfolders under the working folder', () => {
        const background = [card('design/notes/deep/thoughts.md', { title: 'Untitled' })]

        const tree = buildFileTree([], background, 'design')

        const notes = findChild(tree, 'notes')
        expect(notes?.kind).toBe('folder')
        const deep = findChild(notes?.children ?? [], 'deep')
        expect(deep?.kind).toBe('folder')
        expect(deep?.children[0]).toMatchObject({ kind: 'file', label: 'thoughts.md', path: 'design/notes/deep/thoughts.md' })
    })

    it('marks configured top-level folders as special', () => {
        const background = [
            card('design/history/rel1/F-2-old.md', { id: 'F-2', title: 'Old' }),
            card('design/architecture/data.md', { title: 'Untitled' }),
            card('design/notes/plain.md', { title: 'Untitled' }),
        ]

        const tree = buildFileTree([], background, 'design')

        expect(findChild(tree, 'history')?.kind).toBe('special')
        expect(findChild(tree, 'architecture')?.kind).toBe('special')
        expect(findChild(tree, 'notes')?.kind).toBe('folder')
    })

    it('honors a custom special-folder list', () => {
        const background = [card('design/history/x.md'), card('design/vault/y.md')]

        const tree = buildFileTree([], background, 'design', { specialFolders: ['vault'] })

        expect(findChild(tree, 'history')?.kind).toBe('folder')
        expect(findChild(tree, 'vault')?.kind).toBe('special')
    })

    it('places status groups before folder roots', () => {
        const tree = buildFileTree(
            [card('design/F-1-a.md', { id: 'F-1', title: 'Alpha', status: 'todo' })],
            [card('design/history/old.md')],
            'design',
        )

        expect(tree.map((node) => node.kind)).toEqual(['status', 'special'])
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
