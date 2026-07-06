import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ActionEntryPoints } from './action_entry_points'
import { FileTreeView } from '../text_view/file_tree_view'
import { actionService } from '../../services/action_service'
import type { ActionFile } from '../../data/action_types'
import { buildFileTree } from '../../data/file_tree'
import { cardContext, folderContext } from '../../data/action_context'
import { DEFAULT_CARD_TYPES, type ProjectCard } from '../../data/data_types'

function file(definition: unknown): ActionFile {
    return { content: JSON.stringify(definition), path: 'actions/action.json' }
}

function card(id: string, status: string | null, title = id): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        headerFields: {},
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id, internalId: id.toLowerCase(), owner: null,
            policy: {}, status, title,
        },
        isActive: true,
        path: `design/${id}.md`,
    }
}

const featureCard = card('F-010', 'design')

afterEach(() => {
    cleanup()
    actionService.clear()
})

describe('ActionEntryPoints filtering', () => {
    beforeEach(() => {
        actionService.loadFromFiles([
            file([
                { appliesTo: { type: 'feature' }, description: 'Implement', label: 'Implement', name: 'implement', text: 't', type: 'agent' },
                { appliesTo: { type: 'bug' }, description: 'Fix', label: 'Fix', name: 'fix', text: 't', type: 'cmd' },
            ]),
        ])
    })

    it('shows only actions whose appliesTo matches the context, plus the always-on custom prompt', () => {
        render(<ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />)

        expect(screen.getByRole('button', { name: 'Implement' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Custom prompt' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Fix' })).not.toBeInTheDocument()
    })

    it('offers the custom prompt action in every context', () => {
        render(<ActionEntryPoints context={folderContext('history', true)} variant="menu" />)

        fireEvent.click(screen.getByRole('button', { name: 'Actions' }))

        expect(screen.getByRole('menuitem', { name: 'Custom prompt' })).toBeInTheDocument()
    })
})

describe('ActionEntryPoints popup', () => {
    beforeEach(() => {
        actionService.loadFromFiles([
            file([
                { description: 'Branch', label: 'Create branch', name: 'branch', text: 't', type: 'cmd' },
                { description: 'Lint', label: 'Run lint', name: 'lint', text: 't', type: 'cmd' },
                {
                    after: ['lint'],
                    appliesTo: { type: 'feature' },
                    before: ['branch'],
                    description: 'Implement',
                    label: 'Implement',
                    name: 'implement',
                    text: 't',
                    type: 'agent',
                },
            ]),
        ])
    })

    it('opens a popup bound to the action with a Run command from an icon entry point', () => {
        render(<ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />)

        fireEvent.click(screen.getByRole('button', { name: 'Implement' }))

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByRole('button', { name: 'Run' })).toBeInTheDocument()
        expect(within(dialog).getByRole('heading', { name: 'Implement' })).toBeInTheDocument()
    })

    it('opens a popup from the overflow menu entry point', () => {
        render(<ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="menu" />)

        fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Implement' }))

        expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Run' })).toBeInTheDocument()
    })

    it('navigates a before shortcut to a new popup for the related action, same context', () => {
        render(<ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />)

        fireEvent.click(screen.getByRole('button', { name: 'Implement' }))
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create branch' }))

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByText('Create branch')).toBeInTheDocument()
        expect(within(dialog).queryByRole('button', { name: 'Create branch' })).not.toBeInTheDocument()
    })
})

describe('entry-point placement in the file tree', () => {
    beforeEach(() => {
        actionService.loadFromFiles([])
    })

    it('places an Actions menu on folder and file rows but not on status groups', () => {
        const active = [card('F-1', 'todo', 'Alpha')]
        const background = [card('F-9', null, 'Old')]
        background[0] = { ...background[0], path: 'design/history/F-9.md' }
        const tree = buildFileTree(active, background, 'design')
        const cardsByPath = new Map(active.concat(background).map((entry) => [entry.path, entry]))

        render(
            <FileTreeView
                cardTypes={DEFAULT_CARD_TYPES}
                cardsByPath={cardsByPath}
                nodes={tree}
                onDeleteFile={async () => undefined}
                onSelect={() => {}}
                selectedPath={null}
            />,
        )

        // history folder + file leaf both expose an Actions menu; the status group ("todo") does not.
        const actionMenus = screen.getAllByRole('button', { name: 'Actions' })
        expect(actionMenus.length).toBeGreaterThanOrEqual(2)
        const todoRow = screen.getByText('todo').closest('div')
        expect(todoRow && within(todoRow).queryByRole('button', { name: 'Actions' })).toBeNull()
    })
})
