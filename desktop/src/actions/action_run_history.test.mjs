import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const {
    appendAgentRunHistory,
    appendCommandRunHistory,
    createAgentHistoryEntry,
    createCommandHistoryEntry,
} = require('./action_run_history')

const action = { id: 'main' }
const cardContext = { file: 'design/card.md', kind: 'card' }
const completedAt = '2026-07-15T10:00:00.000Z'
const project = { branch: 'worktree', rootPath: 'C:/worktree' }

describe('createCommandHistoryEntry', () => {
    it('creates command entry without commit', () => {
        const result = { command: 'test', exitCode: 0, stderr: 'err', stdout: 'out' }

        expect(createCommandHistoryEntry({ action, completedAt, context: cardContext, project, result })).toEqual({
            command: 'test', completedAt, output: 'outerr', prompt: '', status: 'completed',
        })
    })

    it('creates failed command entry with root-commit metadata and card path', () => {
        const result = { command: 'commit', exitCode: 1, stderr: ' failure', stdout: '[main (root-commit) abcdef1] initial' }

        expect(createCommandHistoryEntry({ action, completedAt, context: cardContext, project, result })).toEqual({
            command: 'commit',
            commit: {
                actionId: 'main', branch: 'main', commit: 'abcdef1', completedAt,
                filePaths: ['design/card.md'], repositoryRoot: 'C:/worktree',
            },
            completedAt,
            output: '[main (root-commit) abcdef1] initial failure',
            prompt: '',
            status: 'failed',
        })
    })
})

describe('createAgentHistoryEntry', () => {
    it('creates agent entry without commit for project context', () => {
        const result = {
            agent: 'codex', exitCode: 0, model: 'gpt', prompt: 'review', stderr: '', stdout: 'done', thinkingLevel: 'high',
        }

        expect(createAgentHistoryEntry({ action, completedAt, context: { kind: 'project' }, project, result })).toEqual({
            agent: 'codex', completedAt, model: 'gpt', output: 'done', prompt: 'review', status: 'completed', thinkingLevel: 'high',
        })
    })

    it('creates agent entry with execution repository metadata', () => {
        const result = {
            agent: 'claude', exitCode: 0, model: 'sonnet', prompt: 'review', stderr: '',
            stdout: '[feature abcdef2] change', thinkingLevel: 'none',
        }

        expect(createAgentHistoryEntry({ action, completedAt, context: cardContext, project, result }).commit).toEqual({
            actionId: 'main', branch: 'feature', commit: 'abcdef2', completedAt,
            filePaths: ['design/card.md'], repositoryRoot: 'C:/worktree',
        })
    })
})

describe('history persistence', () => {
    it.each([
        ['command', appendCommandRunHistory, { command: 'test', exitCode: 0, stderr: '', stdout: '' }],
        ['agent', appendAgentRunHistory, {
            agent: 'codex', exitCode: 0, model: 'gpt', prompt: 'review', stderr: '', stdout: '', thinkingLevel: 'none',
        }],
    ])('persists %s entry with action folder and context', async (_type, appendRunHistory, result) => {
        const localGitService = { appendActionRunHistory: vi.fn(async () => []) }
        const input = { action, actionsFolder: 'actions', completedAt, context: cardContext, project, result }

        await appendRunHistory(localGitService, input)

        expect(localGitService.appendActionRunHistory).toHaveBeenCalledWith(project, {
            actionId: 'main', actionsFolder: 'actions', context: cardContext,
        }, expect.objectContaining({ completedAt }))
    })

    it('propagates persistence failure', async () => {
        const localGitService = { appendActionRunHistory: vi.fn(async () => { throw new Error('write failed') }) }
        const result = { command: 'test', exitCode: 0, stderr: '', stdout: '' }

        await expect(appendCommandRunHistory(localGitService, {
            action, actionsFolder: 'actions', context: cardContext, project, result,
        })).rejects.toThrow('write failed')
    })
})
