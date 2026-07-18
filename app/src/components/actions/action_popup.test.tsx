import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../data/action_context'
import type { ActionFile } from '../../data/action_types'
import { actionService } from '../../services/actions/action_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { ActionPopup, CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup'

function file(definition: { id: string }): ActionFile {
    return { content: JSON.stringify(definition), path: `actions/${definition.id}.json` }
}

function commandDefinition(id: string, overrides: Record<string, unknown> = {}) {
    return { command: 'run', description: `${id} description`, id, label: id, type: 'command', ...overrides }
}

const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }

function renderPopup(contextOverride: ActionContext = context, onClose = vi.fn()) {
    render(
        <AppThemeProvider>
            <ActionPopup anchorElement={document.body} context={contextOverride} onClose={onClose} />
        </AppThemeProvider>,
    )

    return { onClose }
}

describe('ActionPopup', () => {
    beforeEach(() => {
        window.md2Actions = {
            onActionExecution: vi.fn(() => vi.fn()),
            prepareActionPrompt: vi.fn(async () => ({ prompt: '' })),
        } as unknown as typeof window.md2Actions
        actionService.loadFromFiles([
            file(commandDefinition('first', { label: 'First action' })),
            file(commandDefinition('second', { label: 'Second action' })),
        ])
    })

    afterEach(() => {
        delete window.md2Actions
        actionService.clear()
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
