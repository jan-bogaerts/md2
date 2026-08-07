import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { ActionDefinition } from '../../../../data/action_types'
import type { AgentConversation } from '../../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import type { ActionConversationStore } from '../../conversation/action_conversation_store'
import type { ActionHistoryStore } from '../state/action_history_store'
import { ActionUsageSummaryOwner } from './action_usage_summary_owner'

const action = { id: 'implement', type: 'agent' } as ActionDefinition
const context = { cardInternalId: 'card-1', file: 'design/F-114.md', kind: 'card' as const }

function conversation(id: string, insertions: number, deletions: number): AgentConversation {
    return {
        actionId: action.id,
        cardInternalId: context.cardInternalId,
        cardPath: context.file,
        completedAt: null,
        entries: [{
            content: 'update: design/F-114.md', deletions, id: `${id}-event`, insertions, kind: 'event',
            providerItemId: `${id}-file`, status: 'completed', timestamp: 'now', type: 'fileChange',
        }],
        hasExplicitTitle: true,
        id,
        path: `design/activity/card.json#conversation=${id}`,
        providerSessions: [],
        startedAt: 'now',
        status: 'running',
        title: id,
        viewed: true,
    }
}

describe('ActionUsageSummaryOwner', () => {
    afterEach(() => {
        cleanup()
        actionRunRegistry.stop()
        setActionBridgeOverride(null)
    })

    it('uses live conversation while running and selected conversation otherwise', () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        setActionBridgeOverride({
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge)
        actionRunRegistry.start()
        const selectedConversation = conversation('selected', 2, 1)
        const conversationSnapshot = { conversations: [selectedConversation], loading: false, selectedConversation }
        const conversationStore = {
            conversationOptions: () => [selectedConversation],
            getSnapshot: () => conversationSnapshot,
            subscribe: () => () => undefined,
        } as unknown as ActionConversationStore
        const historySnapshot = { entries: [], error: null }
        const historyStore = {
            getSnapshot: () => historySnapshot,
            load: vi.fn(async () => undefined),
            subscribe: () => () => undefined,
        } as unknown as ActionHistoryStore
        render(
            <AppThemeProvider>
                <ActionUsageSummaryOwner
                    action={action}
                    context={context}
                    conversationStore={conversationStore}
                    historyStore={historyStore}
                />
            </AppThemeProvider>,
        )
        expect(screen.getByText('changes: +2 / -1')).toBeInTheDocument()
        if (!listener) throw new Error('Missing run listener')
        const emit = listener as (event: ActionRunEvent) => void
        const run = {
            actionId: action.id, context, phase: 'main' as const, rootActionId: action.id,
            runId: 'run-1', status: 'running' as const,
        }

        act(() => {
            emit({ ...run, type: 'run' })
            emit({
                ...run,
                type: 'update',
                update: { conversation: conversation('live', 7, 4), kind: 'agentStarted' },
            })
        })

        expect(screen.getByText('changes: +7 / -4')).toBeInTheDocument()
        expect(screen.queryByText('changes: +2 / -1')).not.toBeInTheDocument()
    })
})
