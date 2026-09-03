import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../data/action_context'
import type { ActionRunEvent } from '../data/action_run_types'
import type { ActionDefinition } from '../data/action_types'
import type { MergeConflictSession } from '../data/merge_conflict_types'
import { actionRunRegistry, type ActiveActionRun } from '../services/actions/action_run_registry'
import { dialogService } from '../services/dialog_service'
import type { MergeConflictSnapshot, MergeConflictService } from '../services/project/merge_conflict_service'
import { AppThemeProvider } from '../theme/theme_provider'
import { MergeConflictDialog } from './merge_conflict_dialog'

interface ActionPopupMockProps {
    context: ActionContext
    initialActionId?: string
    onClose: () => void
    open?: boolean
}

const actionRunState = vi.hoisted(() => ({ activeRun: null as ActiveActionRun | null }))
const popupProbe = vi.hoisted(() => ({
    current: null as ActionPopupMockProps | null,
    start: vi.fn(),
}))

vi.mock('./hooks/use_action_runs', () => ({useRunningActionForContext: () => actionRunState.activeRun}))

vi.mock('./actions/run/popup/action_popup', () => ({
    ActionPopup: (props: ActionPopupMockProps) => {
        popupProbe.current = props
        if (!props.open) return null

        return (
            <div aria-label="Action popup" role="dialog">
                <button onClick={props.onClose}>Close popup</button>
                <button onClick={popupProbe.start}>Send</button>
            </div>
        )
    },
}))

function action(id: string, kind: 'merge-conflict' | 'project', type: 'agent' | 'command' = 'agent'): ActionDefinition {
    return {
        agent: null,
        appliesTo: { kind },
        permissionMode: null,
        builtin: false,
        command: type === 'command' ? 'run' : null,
        description: id,
        icon: null,
        id,
        label: id,
        model: null,
        needsWorkTree: false,
        on: [],
        onAfter: [],
        onBefore: [],
        onState: null,
        output: null,
        phrases: [],
        prompt: type === 'agent' ? 'resolve' : null,
        showCommandWindow: false,
        sourcePath: `actions/${id}.json`,
        thinkingLevel: null,
        trackFileChanges: false,
        streaming: false,
        type,
    }
}

function session(paths: string[], externalResolverConfigured = true): MergeConflictSession {
    return {
        conflictedPaths: paths,
        externalResolverConfigured,
        id: 'session-1',
        operation: 'integrate',
        phase: 'squash',
        repositoryRoot: 'C:/repo',
        worktree: 1,
    }
}

class FakeMergeConflictService extends EventTarget {
    abort = vi.fn(async () => undefined)
    continue = vi.fn(async () => undefined)
    createActionContext = vi.fn((path?: string): ActionContext => {
        const currentSession = this.snapshot.session
        if (!currentSession) throw new Error('No active merge conflict session')

        return {
            ...(path ? { conflictFile: path } : {}),
            conflictFiles: currentSession.conflictedPaths.join('\n'),
            conflictSessionId: currentSession.id,
            kind: 'merge-conflict',
        }
    })
    launchResolver = vi.fn(async () => undefined)
    markResolved = vi.fn(async () => undefined)
    rescanSession = vi.fn(async () => undefined)
    private snapshot: MergeConflictSnapshot

    constructor(value: MergeConflictSnapshot) {
        super()
        this.snapshot = value
    }

    getSnapshot() {
        return this.snapshot
    }

    setSnapshot(snapshot: MergeConflictSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent('changed'))
    }
}

function renderDialog(service: FakeMergeConflictService, actions: ActionDefinition[]) {
    render(
        <AppThemeProvider>
            <MergeConflictDialog actions={actions} service={service as unknown as MergeConflictService} />
        </AppThemeProvider>,
    )
}

function emitActionEvent(listener: ((event: ActionRunEvent) => void) | null, event: ActionRunEvent) {
    if (!listener) throw new Error('Action event listener was not registered')

    listener(event)
}

describe('MergeConflictDialog', () => {
    afterEach(() => {
        cleanup()
        actionRunState.activeRun = null
        popupProbe.current = null
        popupProbe.start.mockReset()
        vi.restoreAllMocks()
    })

    it('lists exact current paths and only explicit merge conflict agent actions', () => {
        const service = new FakeMergeConflictService({ busy: false, session: session(['src/one.ts', 'src/two.ts']) })
        renderDialog(service, [
            action('Resolve conflict', 'merge-conflict'),
            action('Project agent', 'project'),
            action('Conflict command', 'merge-conflict', 'command'),
        ])

        expect(screen.getByRole('dialog', { name: 'Resolve merge conflicts' })).toBeInTheDocument()
        expect(screen.getByText('src/one.ts')).toBeInTheDocument()
        expect(screen.getByText('src/two.ts')).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: /Resolve conflict/u })).toHaveLength(3)
        expect(screen.queryByRole('button', { name: /Project agent/u })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Conflict command/u })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    })

    it('explains empty resolver configuration while agent and cancel remain available', () => {
        const service = new FakeMergeConflictService({ busy: false, session: session(['src/one.ts'], false) })
        renderDialog(service, [action('Resolve conflict', 'merge-conflict')])

        expect(screen.getByText(/External resolver disabled/u)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'External resolver' })).toBeDisabled()
        expect(screen.getAllByRole('button', { name: /Resolve conflict/u })[0]).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
    })

    it('delegates resolver and staging, then opens delayed per-file and resolve-all popups', async () => {
        const service = new FakeMergeConflictService({ busy: false, session: session(['src/one.ts']) })
        const resolveAction = action('Resolve conflict', 'merge-conflict')
        renderDialog(service, [resolveAction])

        fireEvent.click(screen.getByRole('button', { name: 'External resolver' }))
        fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }))
        const actionButtons = screen.getAllByRole('button', { name: /Resolve conflict/u })
        fireEvent.click(actionButtons[0])

        await waitFor(() => expect(service.launchResolver).toHaveBeenCalledWith('src/one.ts'))
        expect(service.markResolved).toHaveBeenCalledWith('src/one.ts')
        expect(popupProbe.current?.initialActionId).toBe(resolveAction.id)
        expect(popupProbe.current?.context).toEqual({
            conflictFile: 'src/one.ts',
            conflictFiles: 'src/one.ts',
            conflictSessionId: 'session-1',
            kind: 'merge-conflict',
        })
        expect(popupProbe.start).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Send' }))
        expect(popupProbe.start).toHaveBeenCalledOnce()

        fireEvent.click(actionButtons[1])
        expect(popupProbe.current?.context).toEqual({
            conflictFiles: 'src/one.ts',
            conflictSessionId: 'session-1',
            kind: 'merge-conflict',
        })
    })

    it('disables Git mutations and unrelated agents while reopening matching active popup', async () => {
        const service = new FakeMergeConflictService({ busy: false, session: session(['src/one.ts']) })
        renderDialog(service, [
            action('Resolve conflict', 'merge-conflict'),
            action('Other agent', 'merge-conflict'),
        ])
        fireEvent.click(screen.getAllByRole('button', { name: /Resolve conflict/u })[0])
        fireEvent.click(screen.getByRole('button', { name: 'Close popup' }))

        actionRunState.activeRun = {
            context: { conflictFiles: 'src/one.ts', conflictSessionId: 'session-1', kind: 'merge-conflict' },
            rootActionId: 'Resolve conflict',
            runId: 'run-1',
            status: 'running',
        }
        service.setSnapshot({ busy: false, session: session(['src/one.ts']) })

        await waitFor(() => expect(screen.getByRole('button', { name: 'External resolver' })).toBeDisabled())
        expect(screen.getByRole('button', { name: 'Mark resolved' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
        expect(screen.getAllByRole('button', { name: /Other agent/u }).every((button) => button.hasAttribute('disabled'))).toBe(true)
        expect(screen.getAllByRole('button', { name: /Resolve conflict/u })[0]).toBeEnabled()

        fireEvent.click(screen.getAllByRole('button', { name: /Resolve conflict/u })[0])
        expect(screen.getByRole('dialog', { name: 'Action popup' })).toBeInTheDocument()
        expect(popupProbe.start).not.toHaveBeenCalled()
    })

    it.each(['completed', 'failed', 'cancelled', 'okButNotAfter'] as const)(
        'rescans matching session once after %s terminal result',
        async (status) => {
            let actionEventListener: ((event: ActionRunEvent) => void) | null = null
            vi.spyOn(actionRunRegistry, 'subscribeContextEvents').mockImplementation((_context, listener) => {
                actionEventListener = listener

                return vi.fn()
            })
            const service = new FakeMergeConflictService({ busy: false, session: session(['src/one.ts']) })
            renderDialog(service, [action('Resolve conflict', 'merge-conflict')])
            fireEvent.click(screen.getAllByRole('button', { name: /Resolve conflict/u })[0])
            await waitFor(() => expect(actionEventListener).not.toBeNull())

            emitActionEvent(actionEventListener, {
                actionId: 'Resolve conflict',
                context: popupProbe.current?.context ?? { kind: 'merge-conflict' },
                phase: 'main',
                rootActionId: 'Resolve conflict',
                runId: `run-${status}`,
                status,
                type: 'run',
            })

            await waitFor(() => expect(service.rescanSession).toHaveBeenCalledWith('session-1'))
            expect(service.rescanSession).toHaveBeenCalledOnce()
        },
    )

    it('reports popup launch and terminal rescan failures', async () => {
        let actionEventListener: ((event: ActionRunEvent) => void) | null = null
        vi.spyOn(actionRunRegistry, 'subscribeContextEvents').mockImplementation((_context, listener) => {
            actionEventListener = listener

            return vi.fn()
        })
        const reportError = vi.spyOn(dialogService, 'error').mockReturnValue({
            critical: false,
            id: 1,
            message: '',
            severity: 'error',
            title: '',
        })
        const service = new FakeMergeConflictService({ busy: false, session: session(['src/one.ts']) })
        service.createActionContext.mockImplementationOnce(() => {
            throw new Error('popup failed')
        })
        renderDialog(service, [action('Resolve conflict', 'merge-conflict')])
        fireEvent.click(screen.getAllByRole('button', { name: /Resolve conflict/u })[0])
        expect(reportError).toHaveBeenCalledWith(expect.any(Error), {fallbackMessage: 'Could not open merge conflict action: Resolve conflict'})

        fireEvent.click(screen.getAllByRole('button', { name: /Resolve conflict/u })[0])
        await waitFor(() => expect(actionEventListener).not.toBeNull())
        service.rescanSession.mockRejectedValueOnce(new Error('rescan failed'))
        emitActionEvent(actionEventListener, {
            actionId: 'Resolve conflict',
            context: popupProbe.current?.context ?? { kind: 'merge-conflict' },
            phase: 'main',
            rootActionId: 'Resolve conflict',
            runId: 'run-1',
            status: 'failed',
            type: 'run',
        })

        await waitFor(() => expect(reportError).toHaveBeenCalledWith(expect.any(Error), {fallbackMessage: 'Could not rescan merge conflicts after agent action'}))
    })

    it('enables Continue only after Git reports no unmerged paths', async () => {
        const service = new FakeMergeConflictService({ busy: false, session: session([]) })
        renderDialog(service, [])

        expect(screen.getByText('All conflict entries are staged. Continue when ready.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        await waitFor(() => expect(service.continue).toHaveBeenCalledOnce())
        expect(service.abort).toHaveBeenCalledOnce()
    })
})
