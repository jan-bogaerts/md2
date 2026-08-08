import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../data/action_types'
import type { MergeConflictSession } from '../data/merge_conflict_types'
import type { MergeConflictSnapshot, MergeConflictService } from '../services/project/merge_conflict_service'
import { AppThemeProvider } from '../theme/theme_provider'
import { MergeConflictDialog } from './merge_conflict_dialog'

function action(id: string, kind: 'merge-conflict' | 'project', type: 'agent' | 'command' = 'agent'): ActionDefinition {
    return {
        accessLevel: null,
        agent: null,
        appliesTo: { kind },
        approvalPolicy: null,
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
        phrases: [],
        prompt: type === 'agent' ? 'resolve' : null,
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
    launchResolver = vi.fn(async () => undefined)
    markResolved = vi.fn(async () => undefined)
    runAgent = vi.fn(async () => undefined)
    private snapshot: MergeConflictSnapshot

    constructor(value: MergeConflictSnapshot) {
        super()
        this.snapshot = value
    }

    getSnapshot() {
        return this.snapshot
    }
}

function renderDialog(service: FakeMergeConflictService, actions: ActionDefinition[]) {
    render(
        <AppThemeProvider>
            <MergeConflictDialog actions={actions} service={service as unknown as MergeConflictService} />
        </AppThemeProvider>,
    )
}

describe('MergeConflictDialog', () => {
    afterEach(cleanup)

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

    it('delegates resolver, staging, per-file agent, and resolve-all agent actions', async () => {
        const service = new FakeMergeConflictService({ busy: false, session: session(['src/one.ts']) })
        const resolveAction = action('Resolve conflict', 'merge-conflict')
        renderDialog(service, [resolveAction])

        fireEvent.click(screen.getByRole('button', { name: 'External resolver' }))
        fireEvent.click(screen.getByRole('button', { name: 'Mark resolved' }))
        const actionButtons = screen.getAllByRole('button', { name: /Resolve conflict/u })
        fireEvent.click(actionButtons[0])
        fireEvent.click(actionButtons[1])

        await waitFor(() => expect(service.launchResolver).toHaveBeenCalledWith('src/one.ts'))
        expect(service.markResolved).toHaveBeenCalledWith('src/one.ts')
        expect(service.runAgent).toHaveBeenNthCalledWith(1, resolveAction, 'src/one.ts')
        expect(service.runAgent).toHaveBeenNthCalledWith(2, resolveAction, undefined)
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
