import { describe, expect, it } from 'vitest'
import type { ActionContext } from '../data/action_context'
import type { ProjectReference } from '../data/data_types'
import { extractCommitMetadata } from './action_history'

const context: ActionContext = { file: 'design/F-010.md', kind: 'card', state: 'design', type: 'feature' }
const project: ProjectReference = { branch: 'main', id: 'local', rootPath: 'C:/repo' }
const completedAt = '2026-01-01T00:00:00.000Z'

describe('extractCommitMetadata', () => {
    it('extracts commit metadata from a git commit summary line', () => {
        const metadata = extractCommitMetadata({
            actionName: 'commit',
            completedAt,
            context,
            output: '[feature/x a1b2c3d] Add tests',
            project,
        })

        expect(metadata).toEqual({
            actionName: 'commit',
            branch: 'feature/x',
            commit: 'a1b2c3d',
            completedAt,
            filePaths: ['design/F-010.md'],
            repositoryRoot: 'C:/repo',
        })
    })

    it('removes the root commit suffix from the branch name', () => {
        const metadata = extractCommitMetadata({
            actionName: 'commit',
            completedAt,
            context,
            output: '[main (root-commit) 0f1e2d3c4b5a] Initial commit',
            project,
        })

        expect(metadata?.branch).toBe('main')
        expect(metadata?.commit).toBe('0f1e2d3c4b5a')
    })

    it('returns null without a commit summary line', () => {
        const metadata = extractCommitMetadata({ actionName: 'build', completedAt, context, output: 'build ok', project })

        expect(metadata).toBeNull()
    })

    it('returns null without a local project root', () => {
        const metadata = extractCommitMetadata({
            actionName: 'commit',
            completedAt,
            context,
            output: '[main a1b2c3d] Add tests',
            project: { branch: 'main', id: 'remote' },
        })

        expect(metadata).toBeNull()
    })
})
