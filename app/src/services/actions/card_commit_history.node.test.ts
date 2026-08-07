import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../data/electron_action_bridge'
import { cardCommitLabel, loadCardBodyDiff, loadCardCommits, type CardCommit } from './card_commit_history'

const cardInternalId = 'card-060'
const olderHash = 'a'.repeat(40)
const newerHash = 'b'.repeat(40)

function activity(): CardActivityFile {
    const record = (runId: string, commit: string, committedAt: string) => ({
        commits: [{ branch: 'main', commit, committedAt, deletions: 1, filePaths: ['cards/F-060.md'], filesChanged: 1, insertions: 2 }],
        completedAt: committedAt,
        conversationIds: [],
        runId,
        details: { command: 'implement', output: '', type: 'command' as const },
        origin: { cardInternalId, kind: 'card' as const },
        rootActionId: 'implement',
        rootActionLabel: 'Implement',
        startedAt: committedAt,
        status: 'completed' as const,
    })

    return {
        actionSettings: {},
        conversations: [],
        origin: { cardInternalId, kind: 'card' },
        records: [
            record('new', newerHash, '2026-07-20T11:00:00.000Z'),
            record('old', olderHash, '2026-07-20T10:00:00.000Z'),
        ],
        version: 3,
    }
}

function installBridge(methods: Partial<ElectronActionBridge>) {
    setActionBridgeOverride(methods as ElectronActionBridge)
}

afterEach(() => setActionBridgeOverride(null))

describe('loadCardCommits', () => {
    it('returns card commits newest first with their owning activity records', async () => {
        installBridge({ loadCardActivity: vi.fn(async () => activity()) })

        const commits = await loadCardCommits(cardInternalId)

        expect(commits.map(({ commit }) => commit)).toEqual([newerHash, olderHash])
        expect(commits[0].record).toMatchObject({ runId: 'new' })
    })

    it('returns no history when local activity support is unavailable', async () => {
        installBridge({})

        await expect(loadCardCommits(cardInternalId)).resolves.toEqual([])
    })

    it('rejects malformed activity instead of hiding corruption', async () => {
        installBridge({ loadCardActivity: vi.fn(async () => ({ ...activity(), version: 1 } as never)) })

        await expect(loadCardCommits(cardInternalId)).rejects.toThrow('unsupported version 1')
    })

    it('loads one system integration commit with its system label', async () => {
        const completedAt = '2026-07-20T12:00:00.000Z'
        const integrationActivity: CardActivityFile = {
            actionSettings: {},
            conversations: [],
            origin: { cardInternalId, kind: 'card' },
            records: [{
                commits: [{
                    branch: 'main', commit: newerHash, committedAt: completedAt, deletions: 1,
                    filePaths: ['cards/F-060.md'], filesChanged: 1, insertions: 2,
                }],
                completedAt,
                label: 'Integrate into project',
                origin: { cardInternalId, kind: 'card' },
                type: 'system',
            }],
            version: 3,
        }
        installBridge({ loadCardActivity: vi.fn(async () => integrationActivity) })

        const commits = await loadCardCommits(cardInternalId)

        expect(commits).toHaveLength(1)
        expect(cardCommitLabel(commits[0].record)).toBe('Integrate into project')
    })
})

describe('loadCardBodyDiff', () => {
    it('reads parent and commit revisions and strips frontmatter', async () => {
        const readFileAtCommit = vi.fn(async ({ parent }: { parent: boolean }) => ({
            content: `---\ntitle: ${parent ? 'Old' : 'New'}\n---\n${parent ? 'old body' : 'new body'}`,
            exists: true,
        }))
        installBridge({ readFileAtCommit } as Partial<ElectronActionBridge>)
        const [commit] = (await (async () => {
            installBridge({ loadCardActivity: vi.fn(async () => activity()), readFileAtCommit })
            return loadCardCommits(cardInternalId)
        })())

        await expect(loadCardBodyDiff(commit, 'cards/F-060.md')).resolves.toEqual({newBody: 'new body', newExists: true, oldBody: 'old body', oldExists: true})
        expect(readFileAtCommit).toHaveBeenCalledTimes(2)
    })

    it('reports an unavailable commit without reading Git', async () => {
        const readFileAtCommit = vi.fn()
        installBridge({ readFileAtCommit })
        const commit = { available: false } as CardCommit

        await expect(loadCardBodyDiff(commit, 'cards/F-060.md')).rejects.toThrow(
            'Commit is no longer available in this repository',
        )
        expect(readFileAtCommit).not.toHaveBeenCalled()
    })
})
