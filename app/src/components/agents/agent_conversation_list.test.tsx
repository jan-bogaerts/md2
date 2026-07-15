import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionExecutionEvent } from '../../data/action_run_types'
import type { ElectronActionBridge } from '../../data/electron_action_bridge'
import { setActionBridgeOverride } from '../../data/electron_action_bridge'
import { actionExecutionService } from '../../services/action_execution_service'
import { actionService } from '../../services/action_service'
import { AgentConversationList } from './agent_conversation_list'

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
        sendActionInput: vi.fn(async () => undefined),
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

function renderPanel(onSendInput = vi.fn()) {
    render(
        <AgentConversationList
            context={context}
            conversations={[]}
            errors={[]}
            onContinue={vi.fn()}
            onSendInput={onSendInput}
            onStart={vi.fn()}
        />,
    )
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

    it('sends agent input by action execution id', () => {
        actionService.loadFromFiles([actionFile('review', 'agent')])
        const { emit } = installBridge()
        const onSendInput = vi.fn()
        renderPanel(onSendInput)

        emit({ actionId: 'review', context, executionId: 'execution-2', phase: 'main', rootActionId: 'review', status: 'running', type: 'execution' })
        emit({ actionId: 'review', context, executionId: 'execution-2', phase: 'main', rootActionId: 'review', status: 'running', type: 'action' })
        fireEvent.change(screen.getByLabelText('Input'), { target: { value: 'continue' } })
        fireEvent.click(screen.getByRole('button', { name: 'Send' }))

        expect(onSendInput).toHaveBeenCalledWith('execution-2', 'continue')
    })

    it('disables execution controls with an explanation without Electron', () => {
        renderPanel()

        expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
        expect(screen.getByText('Action execution requires the Electron desktop app')).toBeInTheDocument()
    })
})
