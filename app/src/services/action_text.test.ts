import { describe, expect, it } from 'vitest'
import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type { ProjectReference } from '../data/data_types'
import { resolveAgentPrompt, resolvePlaceholders } from './action_text'

function action(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
    return {
        after: [],
        agent: null,
        appliesTo: null,
        before: [],
        builtin: false,
        description: 'description',
        icon: null,
        label: 'Implement',
        model: null,
        name: 'implement',
        on: [],
        onState: null,
        text: 'implement {{file}}',
        type: 'agent',
        ...overrides,
    }
}

const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }
const project: ProjectReference = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

describe('resolvePlaceholders', () => {
    it('resolves file, root project folder, and prompt placeholders', () => {
        const resolvedText = resolvePlaceholders('run {{rootProjectFolder}} {{file}} {{prompt}}', context, project, 'focus tests')

        expect(resolvedText).toBe('run C:/repo design/F-010.md focus tests')
    })

    it('throws when resolving file without a file context', () => {
        const missingFileContext: ActionContext = { kind: 'card', state: 'design', type: 'feature' }

        expect(() => resolvePlaceholders('run {{file}}', missingFileContext, project, '')).toThrow('Cannot resolve file placeholder without a file context')
    })

    it('throws when resolving root project folder without a root path', () => {
        const remoteProject: ProjectReference = { branch: 'main', id: 'remote' }

        expect(() => resolvePlaceholders('run {{rootProjectFolder}}', context, remoteProject, '')).toThrow('Cannot resolve rootProjectFolder without a local project rootPath')
    })
})

describe('resolveAgentPrompt', () => {
    it('appends extra prompt when the action text has no prompt placeholder', () => {
        const prompt = resolveAgentPrompt(action({ text: 'implement {{file}}' }), context, project, 'focus tests')

        expect(prompt).toBe('implement design/F-010.md\n\nfocus tests')
    })

    it('inserts extra prompt into the prompt placeholder without appending it again', () => {
        const prompt = resolveAgentPrompt(action({ text: 'custom {{prompt}}' }), context, project, 'write docs')

        expect(prompt).toBe('custom write docs')
    })

    it('does not append empty extra prompt text', () => {
        const prompt = resolveAgentPrompt(action({ text: 'implement {{file}}' }), context, project, '   ')

        expect(prompt).toBe('implement design/F-010.md')
    })
})
