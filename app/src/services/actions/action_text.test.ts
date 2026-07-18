import { describe, expect, it } from 'vitest'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { ProjectReference } from '../../data/data_types'
import { resolveAgentPrompt, resolvePlaceholders } from './action_text'

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
        needsWorkTree: false,
        on: [],
        onAfter: [],
        onBefore: [],
        onState: null,
        prompt: 'implement {{card-file}}',
        sourcePath: 'actions/implement.json',
        thinkingLevel: null,
        trackFileChanges: false,
        type: 'agent',
        ...overrides,
        phrases: overrides.phrases ?? [],
    }
}

const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', title: 'Placeholder support', type: 'feature' }
const project: ProjectReference = { branch: 'main', id: 'local', rootPath: 'C:/repo' }

describe('resolvePlaceholders', () => {
    it('resolves card file, card title, root project folder, and card prompt placeholders', () => {
        const resolvedText = resolvePlaceholders('run {{rootProjectFolder}} {{card-file}} {{card-title}} {{card-prompt}}', context, project, 'focus tests')

        expect(resolvedText).toBe('run C:/repo design/F-010.md Placeholder support focus tests')
    })

    it('throws when resolving card-file without a file context', () => {
        const missingFileContext: ActionContext = { kind: 'card', state: 'design', type: 'feature' }

        expect(() => resolvePlaceholders('run {{card-file}}', missingFileContext, project, '')).toThrow('Cannot resolve card-file placeholder without a file context')
    })

    it('throws when resolving card-title without a card title', () => {
        const missingTitleContext: ActionContext = { file: 'design/F-010.md', kind: 'card' }

        expect(() => resolvePlaceholders('run {{card-title}}', missingTitleContext, project, '')).toThrow('Cannot resolve card-title placeholder without a card title')
    })

    it('throws when resolving root project folder without a root path', () => {
        const remoteProject: ProjectReference = { branch: 'main', id: 'remote' }

        expect(() => resolvePlaceholders('run {{rootProjectFolder}}', context, remoteProject, '')).toThrow('Cannot resolve rootProjectFolder without a local project rootPath')
    })

    it('does not resolve removed placeholder names', () => {
        expect(resolvePlaceholders('{{file}} {{prompt}}', context, project, 'focus')).toBe('{{file}} {{prompt}}')
    })
})

describe('resolveAgentPrompt', () => {
    it('appends extra prompt when the action text has no prompt placeholder', () => {
        const prompt = resolveAgentPrompt(action({ prompt: 'implement {{card-file}}' }), context, project, 'focus tests')

        expect(prompt).toBe('implement design/F-010.md\n\nfocus tests')
    })

    it('inserts extra prompt into the card-prompt placeholder without appending it again', () => {
        const prompt = resolveAgentPrompt(action({ prompt: 'custom {{card-prompt}}' }), context, project, 'write docs')

        expect(prompt).toBe('custom write docs')
    })

    it('does not append empty extra prompt text', () => {
        const prompt = resolveAgentPrompt(action({ prompt: 'implement {{card-file}}' }), context, project, '   ')

        expect(prompt).toBe('implement design/F-010.md')
    })
})
