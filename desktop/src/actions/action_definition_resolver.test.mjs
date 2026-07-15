import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { resolveActionDefinition } = require('./action_definition_resolver')

const project = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

function actionFile(id) {
    return {
        content: JSON.stringify({ command: id, description: id, id, label: id, name: id, type: 'command' }),
        path: `actions/${id}.json`,
    }
}

describe('resolveActionDefinition', () => {
    it('loads persisted and builtin definitions through one resolver', async () => {
        const localGitService = { loadActionFiles: vi.fn(async () => [actionFile('test')]) }

        await expect(resolveActionDefinition(localGitService, project, 'actions', [], 'test'))
            .resolves.toMatchObject({ id: 'test' })
        await expect(resolveActionDefinition(localGitService, project, 'actions', [], 'md2.convert-remarkable-images-to-text'))
            .resolves.toMatchObject({ builtin: true, id: 'md2.convert-remarkable-images-to-text' })
    })

    it('rejects unknown ids after loading current definitions', async () => {
        const localGitService = { loadActionFiles: vi.fn(async () => []) }

        await expect(resolveActionDefinition(localGitService, project, 'actions', [], 'missing')).rejects.toThrow('Unknown action: missing')
    })
})
