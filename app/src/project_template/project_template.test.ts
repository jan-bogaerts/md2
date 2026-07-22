import { describe, expect, it } from 'vitest'
import { loadActionDefinitions } from '../services/actions/action_definition_loader'
import { createDefaultActionFiles } from './project_template'

describe('project template', () => {
    it('creates valid default actions under the resolved actions folder', () => {
        const files = createDefaultActionFiles('projects/demo/actions')

        expect(files.map(({ path }) => path)).toEqual([
            'projects/demo/actions/complete-card.json',
            'projects/demo/actions/fix-bug.json',
            'projects/demo/actions/implement.json',
            'projects/demo/actions/prep-to-implement.json',
        ])
        expect(loadActionDefinitions(files, { validateAgentCapabilities: false })).toHaveLength(6)
    })
})
