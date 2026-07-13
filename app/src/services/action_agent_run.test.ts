import { describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../data/action_types'
import type { DesktopConfigValues } from './config_service'
import { resolveAgentRun } from './action_agent_run'

function action(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
    return {
        agent: null,
        appliesTo: null,
        builtin: false,
        command: null,
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
        prompt: 'implement',
        sourcePath: 'actions/implement.json',
        thinkingLevel: null,
        type: 'agent',
        ...overrides,
    }
}

const config: DesktopConfigValues = {
    agent: 'codex',
    agentProfiles: [
        { command: 'codex', modelArgument: '--model', models: ['gpt-5', 'gpt-5-mini'], name: 'codex', sessionIdPattern: 'Session: (.+)' },
        { command: 'custom --model {{model}}', models: ['fast'], name: 'custom' },
    ],
    agentSlotCommand: '',
    model: 'gpt-5',
    projectLocationMode: 'folder',
}

describe('resolveAgentRun', () => {
    it('uses run input before action values and global defaults', () => {
        const resolved = resolveAgentRun(config, action({ agent: 'custom', model: 'fast' }), { agent: 'codex', model: 'gpt-5-mini' })

        expect(resolved).toEqual({
            agent: 'codex',
            command: 'codex --model gpt-5-mini',
            model: 'gpt-5-mini',
            sessionIdPattern: 'Session: (.+)',
        })
    })

    it('uses action agent values before global defaults', () => {
        const resolved = resolveAgentRun(config, action({ agent: 'custom', model: 'fast' }), {})

        expect(resolved).toEqual({ agent: 'custom', command: 'custom --model fast', model: 'fast' })
    })
})
