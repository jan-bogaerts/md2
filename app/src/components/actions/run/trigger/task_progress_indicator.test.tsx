import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionRunEvent } from '../../../../data/action_run_types'
import type { AgentConversation, AgentTaskList } from '../../../../data/data_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { TaskProgressIndicator } from './task_progress_indicator'

const context = { cardInternalId: 'card-1', file: 'design/F-435.md', kind: 'card' as const }
const listeners: Array<(event: ActionRunEvent) => void> = []

function taskList(tasks: AgentTaskList['tasks']): AgentTaskList {
    return { tasks, updatedAt: '2026-10-20T10:00:00.000Z' }
}

function conversation(id: string, list?: AgentTaskList): AgentConversation {
    return {
        actionId: 'implement',
        cardInternalId: context.cardInternalId,
        cardPath: context.file,
        completedAt: null,
        entries: [],
        hasExplicitTitle: false,
        id,
        path: `design/activity/card.json#conversation=${id}`,
        providerSessions: [],
        startedAt: '2026-10-20T09:00:00.000Z',
        status: 'running',
        taskList: list,
        title: 'Implement',
        viewed: true,
    }
}

function emitRun(runId: string, list?: AgentTaskList) {
    const emit = listeners[0]
    if (!emit) throw new Error('Missing action run listener')
    const event = { actionId: 'implement', context, phase: 'main' as const, rootActionId: 'implement', runId, status: 'running' as const }

    act(() => {
        emit({ ...event, type: 'run' })
        emit({ ...event, type: 'update', update: { conversation: conversation(`conversation-${runId}`, list), kind: 'agentStarted' } })
    })
}

function updateTaskList(runId: string, list: AgentTaskList) {
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
        update: { kind: 'agentTaskList', taskList: list },
    }))
}

function renderIndicator(runId: string) {
    return render(<TaskProgressIndicator runId={runId} />, { wrapper: AppThemeProvider })
}

describe('TaskProgressIndicator', () => {
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

    it.each([
        ['missing task list', undefined],
        ['empty task list', taskList([])],
    ])('renders nothing for a %s', (_scenario, list) => {
        emitRun('run-1', list)
        const { container } = renderIndicator('run-1')

        expect(container).toBeEmptyDOMElement()
    })

    it('shows completed task ratio as determinate accessible progress', () => {
        emitRun('run-1', taskList([
            { id: 'task-1', status: 'pending', subject: 'Inspect state' },
            { id: 'task-2', status: 'inProgress', subject: 'Write tests' },
            { id: 'task-3', status: 'completed', subject: 'Implement component' },
            { id: 'task-4', status: 'completed', subject: 'Review result' },
        ]))
        renderIndicator('run-1')

        const progress = screen.getByRole('progressbar', { name: 'Task progress: 2 of 4 completed' })
        expect(progress).toHaveAttribute('aria-valuenow', '50')
        expect(progress).toHaveAttribute('aria-valuemin', '0')
        expect(progress).toHaveAttribute('aria-valuemax', '100')
    })

    it('updates when the run publishes a replacement task list', () => {
        emitRun('run-1', taskList([
            { id: 'task-1', status: 'pending', subject: 'Inspect state' },
            { id: 'task-2', status: 'completed', subject: 'Implement component' },
        ]))
        renderIndicator('run-1')

        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')

        updateTaskList('run-1', taskList([
            { id: 'task-1', status: 'completed', subject: 'Inspect state' },
            { id: 'task-2', status: 'completed', subject: 'Implement component' },
            { id: 'task-3', status: 'pending', subject: 'Review result' },
        ]))

        const progress = screen.getByRole('progressbar', { name: 'Task progress: 2 of 3 completed' })
        expect(progress).toHaveAttribute('aria-valuenow', `${2 / 3 * 100}`)
    })

    it('keeps progress scoped to its runId', () => {
        emitRun('run-1', taskList([
            { id: 'task-1', status: 'completed', subject: 'First run task' },
            { id: 'task-2', status: 'pending', subject: 'First run next task' },
        ]))
        emitRun('run-2', taskList([
            { id: 'task-1', status: 'pending', subject: 'Second run task' },
        ]))
        render(
            <>
                <TaskProgressIndicator runId="run-1" />
                <TaskProgressIndicator runId="run-2" />
            </>,
            { wrapper: AppThemeProvider },
        )

        updateTaskList('run-2', taskList([
            { id: 'task-1', status: 'completed', subject: 'Second run task' },
        ]))

        expect(screen.getByRole('progressbar', { name: 'Task progress: 1 of 2 completed' })).toHaveAttribute('aria-valuenow', '50')
        expect(screen.getByRole('progressbar', { name: 'Task progress: 1 of 1 completed' })).toHaveAttribute('aria-valuenow', '100')
    })
})
