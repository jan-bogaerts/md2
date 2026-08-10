import { describe, expect, it } from 'vitest'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
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
        permissionMode: overrides.permissionMode ?? null,
        phrases: overrides.phrases ?? [],
        streaming: overrides.streaming ?? false,
    }
}

const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', title: 'Placeholder support', type: 'feature' }
const folders = {
    projectFolder: 'C:/repo/design',
    releasesFolder: 'C:/repo/design/releases',
    repositoryFolder: 'C:/repo',
    worktreeFolder: 'C:/worktrees/2',
}

describe('resolvePlaceholders', () => {
    it('resolves card values and all folder placeholders', () => {
        const resolvedText = resolvePlaceholders(
            'run {{worktree-folder}} {{repository-folder}} {{project-folder}} {{releases-folder}} {{card-file}} {{card-title}} {{card-prompt}}',
            context,
            folders,
            'focus tests',
        )

        expect(resolvedText).toBe('run C:/worktrees/2 C:/repo C:/repo/design C:/repo/design/releases design/F-010.md Placeholder support focus tests')
    })

    it('throws when resolving card-file without a file context', () => {
        const missingFileContext: ActionContext = { kind: 'card', state: 'design', type: 'feature' }

        expect(() => resolvePlaceholders('run {{card-file}}', missingFileContext, folders, '')).toThrow('Cannot resolve card-file placeholder without a file context')
    })

    it('throws when resolving card-title without a card title', () => {
        const missingTitleContext: ActionContext = { file: 'design/F-010.md', kind: 'card' }

        expect(() => resolvePlaceholders('run {{card-title}}', missingTitleContext, folders, '')).toThrow('Cannot resolve card-title placeholder without a card title')
    })

    it('throws when resolving a required folder without its value', () => {
        expect(() => resolvePlaceholders('run {{repository-folder}}', context, { ...folders, repositoryFolder: '' }, ''))
            .toThrow('Cannot resolve repository-folder without an opened repository path')
        expect(() => resolvePlaceholders('run {{releases-folder}}', context, { ...folders, releasesFolder: '' }, ''))
            .toThrow('Cannot resolve releases-folder without a configured releases folder')
    })

    it('resolves selected and remaining merge conflict paths', () => {
        const conflictContext: ActionContext = {
            conflictFile: 'src/one.ts',
            conflictFiles: 'src/one.ts\nsrc/two.ts',
            conflictSessionId: 'session-1',
            kind: 'merge-conflict',
        }

        expect(resolvePlaceholders('{{conflict-file}}\n{{conflict-files}}', conflictContext, folders, ''))
            .toBe('src/one.ts\nsrc/one.ts\nsrc/two.ts')
    })

    it('requires conflict path values used by prompt placeholders', () => {
        const conflictContext: ActionContext = { conflictSessionId: 'session-1', kind: 'merge-conflict' }

        expect(() => resolvePlaceholders('{{conflict-file}}', conflictContext, folders, '')).toThrow('selected conflict file')
        expect(() => resolvePlaceholders('{{conflict-files}}', conflictContext, folders, '')).toThrow('without conflict files')
    })

    it('does not resolve removed placeholder names', () => {
        expect(resolvePlaceholders('{{rootProjectFolder}} {{file}} {{prompt}}', context, folders, 'focus'))
            .toBe('{{rootProjectFolder}} {{file}} {{prompt}}')
    })
})

describe('resolveAgentPrompt', () => {
    it('appends extra prompt when the action text has no prompt placeholder', () => {
        const prompt = resolveAgentPrompt(action({ prompt: 'implement {{card-file}}' }), context, folders, 'focus tests')

        expect(prompt).toBe('implement design/F-010.md\n\nfocus tests')
    })

    it('inserts extra prompt into the card-prompt placeholder without appending it again', () => {
        const prompt = resolveAgentPrompt(action({ prompt: 'custom {{card-prompt}}' }), context, folders, 'write docs')

        expect(prompt).toBe('custom write docs')
    })

    it('does not append empty extra prompt text', () => {
        const prompt = resolveAgentPrompt(action({ prompt: 'implement {{card-file}}' }), context, folders, '   ')

        expect(prompt).toBe('implement design/F-010.md')
    })
})
