import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../../data/action_run_types'
import { setActionBridgeOverride } from '../../../data/electron_action_bridge'
import { actionVersionRequestService } from '../../../services/actions/action_version_request_service'
import { configService } from '../../../services/config/config_service'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { ActionVersionDialog } from './action_version_dialog'

const request: Extract<ActionRunEvent, { type: 'inputRequest' }> = {
    actionId: 'release',
    context: { kind: 'project' },
    inputType: 'version',
    phase: 'main',
    prompt: 'Which release?',
    rootActionId: 'release',
    runId: 'run-1',
    status: 'waitingForInput',
    type: 'inputRequest',
}

describe('ActionVersionDialog', () => {
    afterEach(() => {
        cleanup()
        actionVersionRequestService.remove(request.runId)
        setActionBridgeOverride(null)
        configService.clear()
        vi.restoreAllMocks()
    })

    it('prefills last project value, rejects blank input, and saves before answering run', async () => {
        const saveProjectConfig = vi.fn(async () => undefined)
        const answerActionInput = vi.fn(async () => undefined)
        configService.init()
        configService.connectProjectConfigPersistence({ saveProjectConfig, saveProjectFolderGitInclusion: vi.fn() })
        configService.loadProjectConfig({ lastVersion: 'old' })
        setActionBridgeOverride({ answerActionInput, cancelActionRun: vi.fn(async () => undefined) } as never)
        actionVersionRequestService.request(request)
        render(<AppThemeProvider><ActionVersionDialog /></AppThemeProvider>)
        const user = userEvent.setup()

        expect(screen.getByRole('dialog', { name: 'Which release?' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Version' })).toHaveValue('old')
        await user.clear(screen.getByRole('textbox', { name: 'Version' }))
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
        await user.type(screen.getByRole('textbox', { name: 'Version' }), 'candidate 2')
        await user.click(screen.getByRole('button', { name: 'Confirm' }))
        expect(saveProjectConfig).toHaveBeenCalledWith(expect.objectContaining({ lastVersion: 'candidate 2' }))
        expect(answerActionInput).toHaveBeenCalledWith('run-1', { type: 'version', value: 'candidate 2' })
    })

    it('cancels run when user cancels dialog', async () => {
        const cancelActionRun = vi.fn(async () => undefined)
        configService.init()
        configService.loadProjectConfig(null)
        setActionBridgeOverride({ cancelActionRun } as never)
        actionVersionRequestService.request(request)
        render(<AppThemeProvider><ActionVersionDialog /></AppThemeProvider>)

        await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }))
        expect(cancelActionRun).toHaveBeenCalledWith('run-1')
        expect(screen.queryByRole('dialog', { name: 'Which release?' })).not.toBeInTheDocument()
    })

    it('closes on confirmation before project config persistence completes', async () => {
        let resolveSave!: () => void
        const promise = new Promise<void>((resolve) => { resolveSave = resolve })
        const saveProjectConfig = vi.fn(async () => { await promise })
        const answerActionInput = vi.fn(async () => undefined)
        configService.init()
        configService.connectProjectConfigPersistence({ saveProjectConfig, saveProjectFolderGitInclusion: vi.fn() })
        configService.loadProjectConfig(null)
        setActionBridgeOverride({ answerActionInput, cancelActionRun: vi.fn(async () => undefined) } as never)
        actionVersionRequestService.request(request)
        render(<AppThemeProvider><ActionVersionDialog /></AppThemeProvider>)

        await userEvent.setup().type(screen.getByRole('textbox', { name: 'Version' }), '2.0')
        await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm' }))
        expect(screen.queryByRole('dialog', { name: 'Which release?' })).not.toBeInTheDocument()
        expect(saveProjectConfig).toHaveBeenCalled()
        expect(answerActionInput).not.toHaveBeenCalled()

        resolveSave()
        await vi.waitFor(() => expect(answerActionInput).toHaveBeenCalledWith('run-1', { type: 'version', value: '2.0' }))
    })

    it('submits the entered version even when saving the suggestion fails', async () => {
        const answerActionInput = vi.fn(async () => undefined)
        configService.init()
        configService.connectProjectConfigPersistence({ saveProjectConfig: vi.fn(async () => { throw new Error('Save failed') }), saveProjectFolderGitInclusion: vi.fn() })
        configService.loadProjectConfig(null)
        setActionBridgeOverride({ answerActionInput, cancelActionRun: vi.fn(async () => undefined) } as never)
        actionVersionRequestService.request(request)
        render(<AppThemeProvider><ActionVersionDialog /></AppThemeProvider>)

        await userEvent.setup().type(screen.getByRole('textbox', { name: 'Version' }), '2.0')
        await userEvent.setup().click(screen.getByRole('button', { name: 'Confirm' }))
        expect(screen.queryByRole('dialog', { name: 'Which release?' })).not.toBeInTheDocument()
        await vi.waitFor(() => expect(answerActionInput).toHaveBeenCalledWith('run-1', { type: 'version', value: '2.0' }))
    })
})
