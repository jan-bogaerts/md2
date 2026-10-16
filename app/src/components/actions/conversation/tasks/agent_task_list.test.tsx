import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { AgentConversation, AgentTaskList as AgentTaskListValue } from '../../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { ActionRunBindingStore } from '../../run/state/action_run_binding_store'
import type { ActionConversationStore } from '../state/action_conversation_store'
import { AgentTaskList } from './agent_task_list'

const context = { cardInternalId: 'card-1', file: 'design/F-434.md', kind: 'card' as const }

function taskList(tasks: AgentTaskListValue['tasks']): AgentTaskListValue {
    return { tasks, updatedAt: '2026-10-16T10:00:00.000Z' }
}

function conversation(id: string, list?: AgentTaskListValue): AgentConversation {
    return {
        actionId: 'review',
        cardInternalId: context.cardInternalId,
        cardPath: context.file,
        completedAt: null,
        entries: [],
        hasExplicitTitle: false,
        id,
        path: `design/activity/card.json#conversation=${id}`,
        providerSessions: [],
        startedAt: '2026-10-16T09:00:00.000Z',
        status: 'running',
        taskList: list,
        title: 'Review',
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

function renderTaskList(selectedConversation: AgentConversation | null, bindingStore = new ActionRunBindingStore(null)) {
    const rendered = render(
        <AppThemeProvider>
            <AgentTaskList bindingStore={bindingStore} store={conversationStore(selectedConversation)} />
        </AppThemeProvider>,
    )

    return { bindingStore, ...rendered }
}

describe('AgentTaskList', () => {
    afterEach(() => {
        cleanup()
        actionRunRegistry.stop()
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('renders task states, completion count, and active form', () => {
        renderTaskList(conversation('history', taskList([
            { id: 'task-1', status: 'pending', subject: 'Inspect state' },
            { activeForm: 'Writing focused tests', id: 'task-2', status: 'inProgress', subject: 'Write tests' },
            { id: 'task-3', status: 'completed', subject: 'Map event flow' },
        ])))

        const panel = screen.getByRole('region', { name: 'Agent tasks' })
        expect(within(panel).getByText('1/3')).toBeInTheDocument()
        expect(within(panel).getByLabelText('Pending')).toBeInTheDocument()
        expect(within(panel).getByLabelText('In progress')).toBeInTheDocument()
        expect(within(panel).getByLabelText('Completed')).toBeInTheDocument()
        expect(within(panel).getByText('Inspect state')).toBeInTheDocument()
        expect(within(panel).getByText('Writing focused tests')).toBeInTheDocument()
        expect(within(panel).queryByText('Write tests')).not.toBeInTheDocument()
        expect(within(panel).getByText('Map event flow')).toBeInTheDocument()
    })

    it('starts expanded and toggles task details', async () => {
        const user = userEvent.setup()
        renderTaskList(conversation('history', taskList([
            { id: 'task-1', status: 'pending', subject: 'Inspect state' },
        ])))
        const toggle = screen.getByRole('button', { name: 'Toggle agent tasks' })

        expect(toggle).toHaveAttribute('aria-expanded', 'true')
        await user.click(toggle)
        expect(toggle).toHaveAttribute('aria-expanded', 'false')
        await user.click(toggle)
        expect(toggle).toHaveAttribute('aria-expanded', 'true')
    })

    it.each([
        ['no task list', conversation('history')],
        ['an empty task list', conversation('history', taskList([]))],
    ])('renders nothing for %s', (_scenario, selectedConversation) => {
        const { container } = renderTaskList(selectedConversation)

        expect(container).toBeEmptyDOMElement()
    })

    it('updates when a live agentTaskList update arrives', () => {
        let listener: ((event: ActionRunEvent) => void) | null = null
        setActionBridgeOverride({
            onActionRun: vi.fn((nextListener) => {
                listener = nextListener

                return vi.fn()
            }),
        } as unknown as ElectronActionBridge)
        actionRunRegistry.start()
        const bindingStore = new ActionRunBindingStore('run-1')
        renderTaskList(null, bindingStore)
        if (!listener) throw new Error('Missing run listener')
        const emit = listener as (event: ActionRunEvent) => void
        const event = { actionId: 'review', context, phase: 'main' as const, rootActionId: 'review', runId: 'run-1', status: 'running' as const }

        act(() => {
            emit({ ...event, type: 'run' })
            emit({ ...event, type: 'update', update: { conversation: conversation('live'), kind: 'agentStarted' } })
        })
        expect(screen.queryByRole('region', { name: 'Agent tasks' })).not.toBeInTheDocument()

        act(() => emit({
            ...event,
            type: 'update',
            update: {
                kind: 'agentTaskList',
                taskList: taskList([{ activeForm: 'Implementing panel', id: 'task-1', status: 'inProgress', subject: 'Implement panel' }]),
            },
        }))

        const panel = screen.getByRole('region', { name: 'Agent tasks' })
        expect(within(panel).getByText('0/1')).toBeInTheDocument()
        expect(within(panel).getByText('Implementing panel')).toBeInTheDocument()
        bindingStore.dispose()
    })
})
