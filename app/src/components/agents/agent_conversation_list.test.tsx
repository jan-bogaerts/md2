import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import type { ElectronActionBridge } from '../../data/electron_action_bridge'
import { setActionBridgeOverride } from '../../data/electron_action_bridge'
import { actionExecutionService } from '../../services/action_execution_service'
import { actionService } from '../../services/action_service'
import { AgentConversationList } from './agent_conversation_list'
import type { AgentConversation } from '../../data/data_types'

const context = { file: 'design/F-1.md', kind: 'file' as const, state: 'design', type: 'feature' }

function actionFile(id: string, type: 'agent' | 'command') {
    return {
        content: JSON.stringify({
            ...(type === 'agent' ? { prompt: 'Run' } : { command: 'run' }),
            description: id,
            id,
            label: id,
            name: id,
            type,
        }),
        path: `actions/${id}.json`,
    }
}

function installBridge() {
    let listener: ((event: ActionExecutionEvent) => void) | null = null
    const bridge = {
        cancelActionExecution: vi.fn(async () => undefined),
        generateDiff: vi.fn(),
        loadActionRunHistory: vi.fn(async () => [{command: 'run', completedAt: '2026-07-14T10:00:00.000Z', output: 'history output', prompt: '', status: 'completed' as const}]),
        onActionExecution: vi.fn((nextListener) => {
            listener = nextListener

            return vi.fn()
        }),
        openInEditor: vi.fn(),
        runSearchRegexpAgent: vi.fn(),
        startAction: vi.fn(),
    } as unknown as ElectronActionBridge
    setActionBridgeOverride(bridge)

    return {
        bridge,
        emit(event: ActionExecutionEvent) {
            if (!listener) throw new Error('Missing action execution listener')
            act(() => listener?.(event))
        },
    }
}

function renderPanel() {
    render(
        <AgentConversationList
            context={context}
            conversations={[]}
            errors={[]}
            onContinue={vi.fn()}
            onStart={vi.fn()}
        />,
    )
}

const conversation: AgentConversation = {
    actionId: 'review',
    cardPath: context.file,
    completedAt: '2026-07-14T10:00:00.000Z',
    events: [],
    hasExplicitTitle: true,
    id: 'conversation-1',
    messages: [{ agent: 'codex', content: 'Persisted answer', id: 'm1', role: 'assistant', timestamp: '2026-07-14T10:00:00.000Z' }],
    path: '.md2-agent-logs/conversation-1.json',
    providerSessions: [],
    startedAt: '2026-07-14T09:59:00.000Z',
    status: 'completed',
    title: 'Review',
}

describe('AgentConversationList', () => {
    afterEach(() => {
        cleanup()
        actionExecutionService.stop()
        actionService.clear()
        setActionBridgeOverride(null)
    })

    it('shows command execution status and live output without agent input', () => {
        actionService.loadFromFiles([actionFile('build', 'command')])
        const { emit } = installBridge()
        renderPanel()

        emit({ actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', status: 'running', type: 'execution' })
        emit({
            actionId: 'build', context, executionId: 'execution-1', phase: 'main', rootActionId: 'build', status: 'running',
            stdout: 'live command output', type: 'action',
        })

        expect(screen.getByText(/live command output/u)).toBeInTheDocument()
        expect(screen.queryByLabelText('Input')).not.toBeInTheDocument()
    })

    it('disables new-turn input while an agent turn runs', () => {
        actionService.loadFromFiles([actionFile('review', 'agent')])
        const { emit } = installBridge()
        renderPanel()

        emit({ actionId: 'review', context, executionId: 'execution-2', phase: 'main', rootActionId: 'review', status: 'running', type: 'execution' })
        emit({ actionId: 'review', context, executionId: 'execution-2', phase: 'main', rootActionId: 'review', status: 'running', type: 'action' })
        expect(screen.getByLabelText('Agent prompt')).toBeDisabled()
        expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
    })

    it('disables execution controls with an explanation without Electron', () => {
        renderPanel()

        expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
        expect(screen.getByText('Action execution requires the Electron desktop app')).toBeInTheDocument()
    })

    it('shows persisted conversations and selects one for continuation', () => {
        const onContinue = vi.fn()
        installBridge()
        render(
            <AgentConversationList
                context={context}
                conversations={[conversation]}
                errors={[]}
                onContinue={onContinue}
                onStart={vi.fn()}
            />,
        )

        expect(screen.getByText('Persisted answer')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
        expect(onContinue).toHaveBeenCalledWith(conversation)
    })
})
