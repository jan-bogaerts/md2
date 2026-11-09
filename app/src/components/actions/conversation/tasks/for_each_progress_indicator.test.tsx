import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ForEachProgressIndicator } from './for_each_progress_indicator'

const context = { cardInternalId: 'card-1', file: 'design/F-463.md', kind: 'card' as const }
const listeners: Array<(event: ActionRunEvent) => void> = []

function emitProgress(runId: string, processedCount: number, totalCount: number) {
    const emit = listeners[0]
    if (!emit) throw new Error('Missing action run listener')

    act(() => emit({
        actionId: 'implement',
        context,
        phase: 'main',
        rootActionId: 'implement',
        runId,
        status: 'running',
        type: 'update',
        update: { kind: 'forEachProgress', processedCount, totalCount },
    }))
}

function renderIndicator(runId = 'run-1') {
    return render(<ForEachProgressIndicator runId={runId} />, { wrapper: AppThemeProvider })
}

describe('ForEachProgressIndicator', () => {
    beforeEach(() => {
        listeners.length = 0
        setActionBridgeOverride({
            onActionRun: vi.fn((listener) => {
                listeners.push(listener)

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge)
        actionRunRegistry.start()
    })

    afterEach(() => {
        cleanup()
        actionRunRegistry.stop()
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('shows determinate record progress and updates for its run', () => {
        renderIndicator()
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()

        emitProgress('run-1', 0, 3)
        expect(screen.getByRole('progressbar', { name: 'For-each progress: 0 of 3 processed' }))
            .toHaveAttribute('aria-valuenow', '0')

        emitProgress('run-1', 1, 3)
        expect(screen.getByRole('progressbar', { name: 'For-each progress: 1 of 3 processed' }))
            .toHaveAttribute('aria-valuenow', `${1 / 3 * 100}`)
    })

    it('ignores another run and hides when its run becomes terminal', () => {
        renderIndicator()
        emitProgress('run-1', 1, 2)
        emitProgress('run-2', 2, 2)

        expect(screen.getByRole('progressbar')).toHaveAccessibleName('For-each progress: 1 of 2 processed')

        const emit = listeners[0]
        if (!emit) throw new Error('Missing action run listener')
        act(() => emit({
            actionId: 'implement', context, phase: 'main', rootActionId: 'implement', runId: 'run-1',
            status: 'completed', type: 'run',
        }))

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })
})
