import { describe, expect, it } from 'vitest'
import { createDefaultActionFiles } from './project_template'

describe('createDefaultActionFiles', () => {
    it('bundles the project action that generates a repository-specific version script', () => {
        const files = createDefaultActionFiles('design/actions')
        const file = files.find(({ path }) => path === 'design/actions/render-update-version-script.json')
        if (!file) throw new Error('Missing bundled version-script action')
        const definition = JSON.parse(file.content) as { prompt: string }

        expect(definition.prompt).toContain('independently buildable project')
        expect(definition.prompt).toContain('accepts a target version')
    })
    it('uses portable repository paths when combining a bundled action path with card-file', () => {
        const files = createDefaultActionFiles('design/actions')
        const implementFile = files.find(({ path }) => path === 'design/actions/implement.json')
        if (!implementFile) throw new Error('Missing bundled implement action')

        const definition = JSON.parse(implementFile.content) as { prompt: string }

        expect(definition.prompt).toContain('{{repository-folder}}/{{card-file}}')
        expect(definition.prompt).not.toContain('{{project-folder}}\\{{card-file}}')
    })
    it('uses portable paths in the bundled release-note action', () => {
        const files = createDefaultActionFiles('design/actions')
        const file = files.find(({ path }) => path === 'design/actions/write-release-note.json')
        if (!file) throw new Error('Missing bundled release-note action')
        const definition = JSON.parse(file.content) as { prompt: string }

        expect(definition.prompt).toContain('{{repository-folder}}/desktop/package.json')
        expect(definition.prompt).toContain('releases/{VERSION}/release')
    })

})
