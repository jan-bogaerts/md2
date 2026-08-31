import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MenuList } from '@mui/material'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionEntryPoints } from './action_entry_points'
import { FileTreeView } from '../../../text_view/file_tree_view'
import { actionService } from '../../../../services/actions/action_service'
import { dataService } from '../../../../services/data/data_service'
import type { ActionFile } from '../../../../data/action_types'
import { cardContext, folderContext } from '../../../../data/action_context'
import { DEFAULT_CARD_TYPES, type Card } from '../../../../data/data_types'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { dialogService } from '../../../../services/dialog_service'
import { projectAccessService } from '../../../../services/project/project_access_service'

function file(definition: { id: string }): ActionFile {
    return { content: JSON.stringify(definition), path: `actions/${definition.id}.json` }
}

function agentDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { description: id, id, label: id, prompt: 't', type: 'agent', ...overrides }
}

function commandDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { command: 't', description: id, id, label: id, type: 'command', ...overrides }
}

function card(id: string, status: string | null, title = id): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id, internalId: id.toLowerCase(), owner: null,
            policy: {}, references: [], status, title,
        },
        hasFrontmatter:true,
        isActive: true,
        path: `design/${id}.md`,
    }
}

const featureCard = card('F-010', 'design')

afterEach(() => {
    actionRunRegistry.stop()
    delete window.md2Actions
    cleanup()
    actionService.clear()
    projectAccessService.setReadOnly(false)
    vi.restoreAllMocks()
})

describe('ActionEntryPoints filtering', () => {
    beforeEach(() => {
        actionService.loadFromFiles([
            file(agentDefinition('implement', { appliesTo: { type: 'feature' }, label: 'Implement' })),
            file(commandDefinition('fix', { appliesTo: { type: 'bug' }, label: 'Fix' })),
        ])
    })

    it('disables matching action entry points for read-only projects', () => {
        projectAccessService.setReadOnly(true)

        render(<ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />)

        expect(screen.getByRole('button', { name: 'Implement' })).toBeDisabled()
    })

    it('shows only actions whose appliesTo matches the context, plus the always-on custom prompt', () => {
        render(<ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />)

        expect(screen.getByRole('button', { name: 'Implement' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument()
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

        expect(screen.getByRole('menuitem', { name: '+' })).toBeInTheDocument()
    })

    it('can restrict entry points to actions explicitly scoped to the context kind', () => {
        actionService.loadFromFiles([
            file(agentDefinition('generic', { label: 'Generic' })),
            file(agentDefinition('project', { appliesTo: { kind: 'project' }, label: 'Project action' })),
        ])

        render(<ActionEntryPoints context={{ kind: 'project' }} variant="icons" visibility="explicit-context" />)

        expect(screen.getByRole('button', { name: 'Project action' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Generic' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: '+' })).not.toBeInTheDocument()
    })

    it.each(['completed', 'failed', 'cancelled', 'okButNotAfter'] as const)(
        'disables card entry points while running and enables them after %s',
        (terminalStatus) => {
            let listener: ((event: ActionRunEvent) => void) | null = null
            window.md2Actions = {
                onActionRun: (nextListener: (event: ActionRunEvent) => void) => {
                    listener = nextListener

                    return vi.fn()
                },
            } as unknown as typeof window.md2Actions
            actionRunRegistry.start()
            const context = cardContext(featureCard, DEFAULT_CARD_TYPES)
            render(<ActionEntryPoints context={context} variant="icons" />)
            if (!listener) throw new Error('Missing run listener')
            const emit = listener as (event: ActionRunEvent) => void

            act(() => emit({
                actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
                status: 'running', type: 'run',
            }))
            expect(screen.getByRole('button', { name: 'Implement' })).toBeDisabled()

            act(() => emit({
                actionId: 'implement', context, runId: 'run-1', phase: 'main', rootActionId: 'implement',
                status: terminalStatus, type: 'run',
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

    it('reports malformed entry-point data without opening a popup', () => {
        const error = vi.spyOn(dialogService, 'error')
        render(<ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />)
        const button = screen.getByRole('button', { name: 'Implement' })
        button.removeAttribute('data-action-id')

        expect(() => fireEvent.click(button)).not.toThrow()
        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Missing action id on action entry point' }),
            { fallbackMessage: 'Action popup could not be opened' },
        )
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('opens the universal popup with the clicked action selected from an icon entry point', () => {
        render(
            <AppThemeProvider>
                <ActionEntryPoints context={cardContext(featureCard, DEFAULT_CARD_TYPES)} variant="icons" />
            </AppThemeProvider>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Implement' }))

        const dialog = screen.getByRole('dialog')
        expect(within(dialog).getByRole('button', { name: 'Send' })).toBeInTheDocument()
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
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: null,
            runningAgents: [],
            snapshot: {
                activeCards: active,
                backgroundCards: background,
                repositoryFiles: [],
                workingFolder: 'design/active',
            },
        })
        const createFolder = vi.fn(async () => undefined)
        const createMarkdownFile = vi.fn(async () => undefined)

        render(
            <FileTreeView
                actionsFolder="design/actions"
                cardTypes={DEFAULT_CARD_TYPES}
                onCreateFolder={createFolder}
                onCreateMarkdownFile={createMarkdownFile}
                onDeleteFile={async () => undefined}
                onDeleteFolder={async () => undefined}
                onLeftPanelInteraction={() => {}}
                projectFolder="design"
                statusColors={new Map([['todo', '#9c4dcc']])}
                workingFolder="design/active"
            />,
        )
        fireEvent.click(screen.getByRole('button', { name: 'active 1' }))

        const actionMenus = screen.getAllByRole('button', { name: 'Actions' })
        expect(actionMenus.length).toBeGreaterThanOrEqual(3)
        const todoRow = screen.getByRole('button', { name: 'todo 1' }).parentElement
        expect(todoRow && within(todoRow).getByRole('button', { name: 'Actions' })).toBeInTheDocument()
    })

    it('mounts row action entry points only while their menu is open', () => {
        actionService.loadFromFiles([
            file(commandDefinition('review', { label: 'Review' })),
        ])
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: null,
            runningAgents: [],
            snapshot: {
                activeCards: [card('F-1', 'todo', 'Alpha')],
                backgroundCards: [],
                repositoryFiles: [],
                workingFolder: 'design',
            },
        })

        render(
            <FileTreeView
                actionsFolder="design/actions"
                cardTypes={DEFAULT_CARD_TYPES}
                onCreateFolder={async () => undefined}
                onCreateMarkdownFile={async () => undefined}
                onDeleteFile={async () => undefined}
                onDeleteFolder={async () => undefined}
                onLeftPanelInteraction={() => {}}
                projectFolder="design"
                statusColors={new Map([['todo', '#9c4dcc']])}
                workingFolder="design"
            />,
        )

        expect(screen.queryByRole('menuitem', { name: 'Review' })).not.toBeInTheDocument()

        fireEvent.click(screen.getAllByRole('button', { name: 'Actions' }).at(-1) as HTMLElement)

        expect(screen.getByRole('menuitem', { name: 'Review' })).toBeInTheDocument()
    })
})
