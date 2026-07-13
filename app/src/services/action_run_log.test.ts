import { describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../data/action_types'
import type { AgentConversation } from '../data/data_types'
import { createAgentLog, createCommandLog, createFailureLog, statusFromExitCode } from './action_run_log'

const action: ActionDefinition = {
    agent: null,
    appliesTo: null,
    builtin: false,
    command: 'implement',
    description: 'description',
    icon: null,
    id: 'action-implement',
    label: 'Implement',
    model: null,
    name: 'implement',
    needsWorkTree: false,
    on: [],
    onAfter: [],
    onBefore: [],
    onState: null,
    prompt: null,
    sourcePath: 'actions/implement.json',
    thinkingLevel: null,
    type: 'command',
}

const conversation: AgentConversation = {
    cardPath: 'design/F-010.md',
    completedAt: '2026-01-01T00:01:00.000Z',
    continuedFrom: null,
    events: [],
    id: 'agent-1',
    messages: [],
    nativeSessionId: null,
    path: '.md2-agent-logs/one.json',
    startedAt: '2026-01-01T00:00:00.000Z',
    status: 'failed',
    title: 'Agent run',
}

describe('action run log helpers', () => {
    it('maps exit codes to run status', () => {
        expect(statusFromExitCode(0)).toBe('completed')
        expect(statusFromExitCode(1)).toBe('failed')
    })

    it('creates command logs with command messages', () => {
        const log = createCommandLog(action, 'main', 'npm test', { command: 'npm test', exitCode: 2, stderr: 'bad', stdout: '' })

        expect(log).toEqual({
            actionName: 'implement',
            command: 'npm test',
            message: 'Implement failed with exit code 2',
            phase: 'main',
            status: 'failed',
            stderr: 'bad',
            stdout: '',
        })
    })

    it('creates agent failure logs with stderr detail', () => {
        const log = createAgentLog(action, 'main', 'codex', {
            command: 'codex',
            conversation,
            exitCode: 1,
            prompt: 'implement',
            reference: '.md2-agent-logs/one.json',
            runId: 'run-1',
            stderr: 'spawn codex ENOENT',
            stdout: '',
        }, 'high')

        expect(log.message).toBe('Implement failed with exit code 1: spawn codex ENOENT')
        expect(log.thinkingLevel).toBe('high')
    })

    it('creates synthetic failure logs', () => {
        const log = createFailureLog(action, 'before', 'Circular action call rejected')

        expect(log.status).toBe('failed')
        expect(log.stderr).toBe('Circular action call rejected')
    })
})
