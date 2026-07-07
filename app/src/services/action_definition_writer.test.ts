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

    it('builds action file paths', () => {
        expect(actionFilePath('actions', 'review-feature')).toBe('actions/review-feature.json')
    })
})
