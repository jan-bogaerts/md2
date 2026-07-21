import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../data/action_context'
import type { ActionFile } from '../../data/action_types'
import type { ProjectReference, StorageService, WorktreeRecord } from '../../data/data_types'
import { actionService } from '../../services/actions/action_service'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/project/worktree_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionPopup, CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup'

function file(definition: { id: string }): ActionFile {
    return { content: JSON.stringify(definition), path: `actions/${definition.id}.json` }
}

function commandDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { command: 'run', description: `${id} description`, id, label: id, type: 'command', ...overrides }
}

function agentDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { description: `${id} description`, id, label: id, prompt: 'Review project', type: 'agent', ...overrides }
}

const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }
const project: ProjectReference = { branch: 'main', id: 'project', rootPath: 'C:\\project' }
const validWorktree: WorktreeRecord = { branch: 'feature', error: null, path: 'C:\\feature', valid: true }

function worktreeStorage(): StorageService {
    return { loadWorktrees: vi.fn(async () => [validWorktree]) } as unknown as StorageService
}

function renderPopup(contextOverride: ActionContext = context, onClose = vi.fn()) {
    render(
        <AppThemeProvider>
            <ActionPopup anchorElement={document.body} context={contextOverride} onClose={onClose} />
        </AppThemeProvider>,
    )

    return { onClose }
}

describe('ActionPopup', () => {
    beforeEach(async () => {
        window.md2Actions = {
            onActionExecution: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionService.loadFromFiles([
            file(commandDefinition('first', { label: 'First action' })),
            file(commandDefinition('second', { label: 'Second action' })),
        ])
        const storage = worktreeStorage()
        worktreeService.init({ projectProvider: () => project, storageProvider: () => storage })
        await worktreeService.load(project)
    })

    afterEach(() => {
        delete window.md2Actions
        actionService.clear()
        worktreeService.clear()
        window.localStorage.clear()
        cleanup()
        vi.restoreAllMocks()
    })

    it('opens the universal selector popup with the first applicable action selected', () => {
        renderPopup()

        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))
        const actionGroup = within(dialog.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'true')
        expect(actionGroup.getByRole('button', { name: 'Second action' })).toHaveAttribute('aria-pressed', 'false')
        expect(dialog.getByRole('button', { name: 'Run' })).toBeInTheDocument()
    })

    it('owns action selection internally', () => {
        renderPopup()
        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))

        fireEvent.click(actionGroup.getByRole('button', { name: 'Second action' }))

        expect(actionGroup.getByRole('button', { name: 'First action' })).toHaveAttribute('aria-pressed', 'false')
        expect(actionGroup.getByRole('button', { name: 'Second action' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('owns add mode internally and selects the custom prompt', async () => {
        renderPopup()
        const dialog = within(screen.getByRole('dialog', { name: 'Run actions' }))

        fireEvent.click(dialog.getByRole('button', { name: 'Add action' }))

        expect(dialog.getByRole('button', { name: 'Custom prompt' })).toHaveAttribute('aria-pressed', 'true')
        expect(await dialog.findByLabelText('Preset name')).toBeInTheDocument()
        expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled()
    })

    it('filters the internal action list by context', () => {
        actionService.loadFromFiles([
            file(commandDefinition('card', { appliesTo: { kind: 'card' }, label: 'Card action' })),
            file(commandDefinition('project', { appliesTo: { kind: 'project' }, label: 'Project action' })),
        ])

        renderPopup()

        const actionGroup = within(screen.getByRole('group', { name: 'Actions' }))
        expect(actionGroup.getByRole('button', { name: 'Card action' })).toBeInTheDocument()
        expect(actionGroup.queryByRole('button', { name: 'Project action' })).not.toBeInTheDocument()
    })

    it('does not render legacy related-action sections', () => {
        actionService.loadFromFiles([
            file(commandDefinition('before', { label: 'Before action' })),
            file(commandDefinition('main', { label: 'Main action', onBefore: ['before'] })),
        ])

        renderPopup()

        expect(screen.queryByText('Before')).not.toBeInTheDocument()
        expect(screen.queryByText('After')).not.toBeInTheDocument()
    })

    it('closes from the popup header', () => {
        const { onClose } = renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(onClose).toHaveBeenCalledOnce()
    })

    it('places accessible worktree and window controls above the action selector', () => {
        renderPopup()

        const toolbar = screen.getByTestId('action-popup-toolbar')
        expect(within(toolbar).getByRole('button', { name: 'Primary worktree' })).toBeInTheDocument()
        expect(within(toolbar).getByRole('button', { name: 'Expand upward' })).toBeInTheDocument()
        expect(within(toolbar).getByRole('button', { name: 'Close' })).toBeInTheDocument()
        expect(within(toolbar).queryByRole('group', { name: 'Actions' })).not.toBeInTheDocument()
        expect(screen.getByRole('group', { name: 'Actions' })).toBeInTheDocument()
    })

    it('persists card assignment changes through card operations', () => {
        const updateCardWorktree = vi.spyOn(dataService.cards, 'updateCardWorktree').mockReturnValue({ content: '', path: context.file as string })
        renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Primary worktree' }))
        fireEvent.click(screen.getByRole('menuitem', { name: /1 — C:\\feature/u }))

        expect(updateCardWorktree).toHaveBeenCalledWith('design/F-010.md', 1)
    })

    it('keeps card selection and reports the error when assignment saving fails', () => {
        vi.spyOn(dataService.cards, 'updateCardWorktree').mockImplementation(() => { throw new Error('save failed') })
        const reportError = vi.spyOn(dialogService, 'error')
        renderPopup()

        fireEvent.click(screen.getByRole('button', { name: 'Primary worktree' }))
        fireEvent.click(screen.getByRole('menuitem', { name: /1 — C:\\feature/u }))

        expect(screen.getByRole('button', { name: 'Primary worktree' })).toBeInTheDocument()
        expect(reportError).toHaveBeenCalledWith(expect.objectContaining({ message: 'save failed' }), {fallbackMessage: 'Could not update worktree assignment'})
    })

    it('uses project session assignment for action filtering and resets it on project load', async () => {
        actionService.loadFromFiles([
            file(commandDefinition('assigned', { appliesTo: { kind: 'project', worktree: '1' }, label: 'Assigned action' })),
        ])
        renderPopup({ kind: 'project' })

        expect(screen.queryByRole('button', { name: 'Assigned action' })).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Primary worktree' }))
        fireEvent.click(screen.getByRole('menuitem', { name: /1 — C:\\feature/u }))
        expect(screen.getByRole('button', { name: 'Assigned action' })).toBeInTheDocument()

        await worktreeService.load({ ...project, id: 'next-project' })
        expect(screen.queryByRole('button', { name: 'Assigned action' })).not.toBeInTheDocument()
    })

    it('prepares project action prompts with the session assignment', async () => {
        actionService.loadFromFiles([file(agentDefinition('review', { appliesTo: { kind: 'project' }, label: 'Review project' }))])
        worktreeService.setProjectActionWorktree(1)

        renderPopup({ kind: 'project' })

        await waitFor(() => expect(window.md2Actions?.prepareActionPrompt).toHaveBeenCalledWith({
            actionId: 'review',
            context: { kind: 'project', worktree: '1' },
        }))
    })

    it('blocks a needsWorkTree action without assignment and reports the reason', async () => {
        actionService.loadFromFiles([
            file(commandDefinition('assigned', { appliesTo: { kind: 'project' }, label: 'Assigned action', needsWorkTree: true })),
        ])
        const reportError = vi.spyOn(dialogService, 'error')
        renderPopup({ kind: 'project' })

        expect(screen.getByRole('alert')).toHaveTextContent('Action "Assigned action" requires a worktree assignment')
        fireEvent.click(screen.getByRole('button', { name: 'Run' }))

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Action "Assigned action" requires a worktree assignment' }),
            { fallbackMessage: 'Action run failed' },
        ))
        expect(window.md2Actions?.startAction).toBeUndefined()
    })

    it('stores card and project popup sizes separately', () => {
        const { unmount } = render(
            <AppThemeProvider><ActionPopup anchorElement={document.body} context={context} onClose={vi.fn()} /></AppThemeProvider>,
        )
        expect(screen.getByRole('dialog')).toHaveStyle({ height: '450px', width: '400px' })
        unmount()

        render(
            <AppThemeProvider><ActionPopup anchorElement={document.body} context={{ kind: 'project' }} onClose={vi.fn()} /></AppThemeProvider>,
        )
        expect(CARD_RUN_POPUP_SIZE_STORAGE_KEY).not.toBe(PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY)
        expect(screen.getByRole('dialog')).toHaveStyle({ height: '450px', width: '400px' })
    })

    it('expands upward and restores the anchored size after collapse', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const { onClose } = renderPopup()
        const dialog = screen.getByRole('dialog')

        fireEvent.click(screen.getByRole('button', { name: 'Expand upward' }))
        expect(dialog.style.height).toBe('100vh')

        fireEvent.click(screen.getByRole('button', { name: 'Collapse downward' }))
        expect(dialog.style.height).toBe('450px')

        fireEvent.click(screen.getByRole('button', { name: 'Expand upward' }))
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(onClose).toHaveBeenCalledOnce()
        expect(consoleError).not.toHaveBeenCalled()
    })
})
