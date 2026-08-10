import { describe, expect, it } from 'vitest'
import { createDefaultActionFiles } from './project_template'

describe('createDefaultActionFiles', () => {
    it('uses repository folder when combining a bundled action path with card-file', () => {
        const files = createDefaultActionFiles('design/actions')
        const implementFile = files.find(({ path }) => path === 'design/actions/implement.json')
        if (!implementFile) throw new Error('Missing bundled implement action')

        const definition = JSON.parse(implementFile.content) as { prompt: string }

        expect(definition.prompt).toContain('{{repository-folder}}\\{{card-file}}')
        expect(definition.prompt).not.toContain('{{project-folder}}\\{{card-file}}')
    })
})
