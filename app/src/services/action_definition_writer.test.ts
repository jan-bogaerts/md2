import { describe, expect, it } from 'vitest'
import type { ActionContext } from '../data/action_context'
import { actionFilePath, createActionDefinition } from './action_definition_writer'

const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }

describe('action definition writer helpers', () => {
    it('creates a reusable action definition from prompt input', () => {
        const definition = createActionDefinition({ context, label: 'Review Feature', prompt: 'review {{file}}' })

        expect(definition).toEqual({
            appliesTo: { type: 'feature' },
            description: 'Custom prompt action: Review Feature',
            label: 'Review Feature',
            name: 'review-feature',
            text: 'review {{file}}',
            type: 'agent',
        })
    })

    it('preserves selected agent settings in a reusable action definition', () => {
        const definition = createActionDefinition({ agent: 'codex', context, label: 'Fix tests', model: 'gpt-5', prompt: 'fix tests' })

        expect(definition).toEqual({
            agent: 'codex',
            appliesTo: { type: 'feature' },
            description: 'Custom prompt action: Fix tests',
            label: 'Fix tests',
            model: 'gpt-5',
            name: 'fix-tests',
            text: 'fix tests',
            type: 'agent',
        })
    })

    it('builds action file paths', () => {
        expect(actionFilePath('actions', 'review-feature')).toBe('actions/review-feature.json')
    })
})
