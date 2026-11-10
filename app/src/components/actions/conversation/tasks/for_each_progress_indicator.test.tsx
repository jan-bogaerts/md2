import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { AgentConversation } from '../../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActionRunBindingStore } from '../../run/state/action_run_binding_store'
import type { ActionConversationStore } from '../state/action_conversation_store'
import { ForEachProgressIndicator } from './for_each_progress_indicator'

const context = { cardInternalId: 'card-1', file: 'design/F-463.md', kind: 'card' as const }
const listeners: Array<(event: ActionRunEvent) => void> = []
const bindingStores: ActionRunBindingStore[] = []

function conversation(id: string, processedCount: number, totalCount: number): AgentConversation {
    return {
        actionId: 'implement',
        cardInternalId: context.cardInternalId,
        cardPath: context.file,
        completedAt: '2026-11-10T10:00:00.000Z',
        entries: [],
        forEachProgress: { processedCount, totalCount },
        hasExplicitTitle: false,
        id,
        path: `design/activity/card.json#conversation=${id}`,
        providerSessions: [],
        startedAt: '2026-11-10T09:00:00.000Z',
        status: 'cancelled',
        title: 'Implement',
        viewed: true,
    }
}

function conversationStore(selectedConversation: AgentConversation | null) {
    const snapshot = { conversations: selectedConversation ? [selectedConversation] : [], loading: false, selectedConversation }

    return {
        getSnapshot: () => snapshot,
        subscribe: () => () => undefined,
    } as unknown as ActionConversationStore
}

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

function renderIndicator(runId: string | null = 'run-1', selectedConversation: AgentConversation | null = null) {
    const bindingStore = new ActionRunBindingStore(runId)
    bindingStores.push(bindingStore)

    return render(
        <ForEachProgressIndicator bindingStore={bindingStore} store={conversationStore(selectedConversation)} />,
        { wrapper: AppThemeProvider },
    )
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
        bindingStores.splice(0).forEach((bindingStore) => bindingStore.dispose())
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

    it('ignores another run and hides when its run completes', () => {
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

    it('keeps live progress when its run is cancelled', () => {
        renderIndicator()
        emitProgress('run-1', 2, 5)
        const emit = listeners[0]
        if (!emit) throw new Error('Missing action run listener')

        act(() => emit({
            actionId: 'implement', context, phase: 'main', rootActionId: 'implement', runId: 'run-1',
            status: 'cancelled', type: 'run',
        }))

        expect(screen.getByRole('progressbar')).toHaveAccessibleName('For-each progress: 2 of 5 processed')
    })

    it('shows persisted progress when reopening a cancelled conversation without its run', () => {
        renderIndicator(null, conversation('conversation-1', 3, 7))

        expect(screen.getByRole('progressbar')).toHaveAccessibleName('For-each progress: 3 of 7 processed')
    })

    it('does not reuse persisted progress when another run starts', () => {
        renderIndicator('run-1', conversation('conversation-1', 3, 7))
        const emit = listeners[0]
        if (!emit) throw new Error('Missing action run listener')

        act(() => emit({
            actionId: 'implement', context, phase: 'main', rootActionId: 'implement', runId: 'run-1',
            status: 'running', type: 'run',
        }))

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })
})
