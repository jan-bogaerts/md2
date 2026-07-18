import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MenuList } from '@mui/material'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionEntryPoints } from './action_entry_points'
import { FileTreeView } from '../text_view/file_tree_view'
import { actionService } from '../../services/actions/action_service'
import { dataService } from '../../services/data/data_service'
import type { ActionFile } from '../../data/action_types'
import { buildFileTree } from '../../data/file_tree'
import { cardContext, folderContext } from '../../data/action_context'
import { DEFAULT_CARD_TYPES, type ProjectCard } from '../../data/data_types'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import { actionExecutionService } from '../../services/actions/action_execution_service'
import { AppThemeProvider } from '../../theme/theme_provider'

function file(definition: { id: string }): ActionFile {
    return { content: JSON.stringify(definition), path: `actions/${definition.id}.json` }
}

function agentDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { description: id, id, label: id, prompt: 't', type: 'agent', ...overrides }
}

function commandDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { command: 't', description: id, id, label: id, type: 'command', ...overrides }
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
    actionExecutionService.stop()
    delete window.md2Actions
    cleanup()
    actionService.clear()
    vi.restoreAllMocks()
})

describe('ActionEntryPoints filtering', () => {
    beforeEach(() => {
        actionService.loadFromFiles([
            file(agentDefinition('implement', { appliesTo: { type: 'feature' }, label: 'Implement' })),
            file(commandDefinition('fix', { appliesTo: { type: 'bug' }, label: 'Fix' })),
        ])
    })

    it('shows only actions whose appliesTo matches the context, plus the always-on custom prompt', () => {
        render(<ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />)

        expect(screen.getByRole('button', { name: 'Implement' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Custom prompt' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Fix' })).not.toBeInTheDocument()
    })

    it('renders configured inline SVG icons on card buttons', async () => {
        actionService.loadFromFiles([
            file(commandDefinition('review', { icon: '<svg viewBox="0 0 1 1"><path d="M0 0h1v1H0z" /></svg>', label: 'Review' })),
        ])

        render(<ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />)

        const button = screen.getByRole('button', { name: 'Review' })
        await waitFor(() => expect(button.querySelector('img')).toBeInTheDocument())
    })

    it('renders project path icons in menu items', async () => {
        vi.spyOn(dataService.projectLoading, 'loadProjectAsset').mockResolvedValue({
            content: 'aWNvbg==',
            contentType: 'image/png',
            encoding: 'base64',
            path: 'actions/icon.png',
        })
        actionService.loadFromFiles([
            file(commandDefinition('review', { icon: 'actions/icon.png', label: 'Review' })),
        ])

        render(<MenuList><ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="menuItems" /></MenuList>)

        const menuItem = screen.getByRole('menuitem', { name: 'Review' })
        await waitFor(() => expect(menuItem.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,aWNvbg=='))
    })

    it('falls back to the default icon for malformed inline SVG', () => {
        actionService.loadFromFiles([
            file(commandDefinition('review', { icon: '<svg><script>alert(1)</script></svg>', label: 'Review' })),
        ])

        render(<ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />)

        const button = screen.getByRole('button', { name: 'Review' })
        expect(button.querySelector('img')).toBeNull()
        expect(button.querySelector('svg')).toBeInTheDocument()
    })

    it('offers the custom prompt action in every context', () => {
        render(<MenuList><ActionEntryPoints context={folderContext('history', true)} variant="menuItems" /></MenuList>)

        expect(screen.getByRole('menuitem', { name: 'Custom prompt' })).toBeInTheDocument()
    })

    it('can restrict entry points to actions explicitly scoped to the context kind', () => {
        actionService.loadFromFiles([
            file(agentDefinition('generic', { label: 'Generic' })),
            file(agentDefinition('project', { appliesTo: { kind: 'project' }, label: 'Project action' })),
        ])

        render(<ActionEntryPoints context={{ kind: 'project' }} variant="icons" visibility="explicit-context" />)

        expect(screen.getByRole('button', { name: 'Project action' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Generic' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Custom prompt' })).not.toBeInTheDocument()
    })

    it.each(['completed', 'failed', 'cancelled', 'okButNotAfter'] as const)(
        'disables card entry points while running and enables them after %s',
        (terminalStatus) => {
            let listener: ((event: ActionExecutionEvent) => void) | null = null
            window.md2Actions = {
                onActionExecution: (nextListener: (event: ActionExecutionEvent) => void) => {
                    listener = nextListener

                    return vi.fn()
                },
            } as unknown as typeof window.md2Actions
            const context = cardContext(featureCard, DEFAULT_CARD_TYPES)
            render(<ActionEntryPoints context={context} variant="icons" />)
            if (!listener) throw new Error('Missing execution listener')
            const emit = listener as (event: ActionExecutionEvent) => void

            act(() => emit({
                actionId: 'implement', context, executionId: 'execution-1', phase: 'main', rootActionId: 'implement',
                status: 'running', type: 'execution',
            }))
            expect(screen.getByRole('button', { name: 'Implement' })).toBeDisabled()

            act(() => emit({
                actionId: 'implement', context, executionId: 'execution-1', phase: 'main', rootActionId: 'implement',
                status: terminalStatus, type: 'execution',
            }))
            expect(screen.getByRole('button', { name: 'Implement' })).toBeEnabled()
        },
    )
})

describe('ActionEntryPoints popup', () => {
    beforeEach(() => {
        actionService.loadFromFiles([
            file(commandDefinition('branch', { label: 'Create branch' })),
            file(commandDefinition('lint', { description: 'Lint', label: 'Run lint' })),
            file(agentDefinition('implement', {appliesTo: { type: 'feature' }, description: 'Implement', label: 'Implement', onAfter: ['lint'], onBefore: ['branch']})),
        ])
    })

    it('opens the universal popup with the clicked action selected from an icon entry point', () => {
        render(
            <AppThemeProvider>
                <ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Implement' }))

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByRole('button', { name: 'Run' })).toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Implement' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('opens a popup from a menu-item entry point', () => {
        render(
            <AppThemeProvider>
                <MenuList><ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="menuItems" /></MenuList>
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('menuitem', { name: 'Implement' }))

        const dialog = within(screen.getByRole('dialog'))
        expect(dialog.getByRole('button', { name: 'Implement' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('switches actions through the universal selector without related-action shortcuts', () => {
        render(
            <AppThemeProvider>
                <ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Implement' }))
        const dialog = within(screen.getByRole('dialog'))
        fireEvent.click(dialog.getByRole('button', { name: 'Run lint' }))

        expect(dialog.getByRole('button', { name: 'Run lint' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.queryByText('Before')).not.toBeInTheDocument()
        expect(screen.queryByText('After')).not.toBeInTheDocument()
    })
})

describe('entry-point placement in the file tree', () => {
    beforeEach(() => {
        actionService.loadFromFiles([])
    })

    it('places an Actions menu on status, folder, and file rows', () => {
        const active = [{ ...card('F-1', 'todo', 'Alpha'), path: 'design/active/F-1.md' }]
        const background = [card('F-9', null, 'Old')]
        background[0] = { ...background[0], path: 'design/history/F-9.md' }
        const tree = buildFileTree(active, background, 'design/active', {
            actions: [],
            hiddenFolderPaths: ['design/logs'],
            projectFolder: 'design',
            repositoryFiles: [],
            specialFolderPaths: ['design/actions', 'design/active', 'design/history'],
        })
        const cardsByPath = new Map(active.concat(background).map((entry) => [entry.path, entry]))
        const createFolder = vi.fn(async () => undefined)
        const createMarkdownFile = vi.fn(async () => undefined)

        render(
            <FileTreeView
                cardTypes={DEFAULT_CARD_TYPES}
                cardsByPath={cardsByPath}
                nodes={tree}
                onCreateFolder={createFolder}
                onCreateMarkdownFile={createMarkdownFile}
                onDeleteFile={async () => undefined}
                onDeleteFolder={async () => undefined}
                onSelect={() => {}}
                projectFolder="design"
                selectedPath={null}
                statusColors={new Map([['todo', '#9c4dcc']])}
            />,
        )

        const actionMenus = screen.getAllByRole('button', { name: 'Actions' })
        expect(actionMenus.length).toBeGreaterThanOrEqual(3)
        const todoRow = screen.getByRole('button', { name: 'todo 1' }).parentElement
        expect(todoRow && within(todoRow).getByRole('button', { name: 'Actions' })).toBeInTheDocument()
    })
})
