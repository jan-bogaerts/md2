import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownFile, StorageService } from '../data/data_types'
import { configService } from './config/config_service'
import { createDataService, createStorage, files, storageFiles } from './test_support/data_service_test_support'
import { createAgentTokenUsageSummary, legacySummaryUsage, serializeAgentTokenUsageSummary } from '../../../shared/agent_token_usage_summary.mjs'
import { createActivityFile } from '../../../shared/card_activity.mjs'
import { parseProjectStatsFile } from '../../../shared/project_stats.mjs'

const RELEASE_STATES = [
    { alwaysVisible: true, state: 'active' },
    { alwaysVisible: true, state: 'done' },
]

describe('ReleaseOperations', () => {
    afterEach(() => {
        vi.useRealTimers()
        delete window.md2Actions
        configService.clear()
    })

    it('completes a release with no assigned worktrees under the configured releases folder', async () => {
        configService.init()
        const finalColumnFile = {
            ...files[0],
            content: files[0].content.replace('status: active', 'status: done'),
            path: 'design/active/F-1-root.md',
        }
        const releaseFiles: MarkdownFile[] = [
            finalColumnFile,
            { content: '---\nid: F-2\ninternalId: imported-card\ntitle: Imported\nstatus: active\n---\n\n# Imported', path: 'design/active/F-2-imported.md' },
            files[1],
        ]
        const repositoryFiles = ['design/agent_token_usage.json', 'design/active/F-1-root.md', 'design/active/F-2-imported.md']
        const storage = createStorage({
            listRepositoryFiles: vi.fn()
                .mockResolvedValue(repositoryFiles),
            loadProject: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({
                archivedFolder: 'archived',
                backgroundShade: 'blue' as const,
                projectFolder: 'design',
                pushMode: 'auto' as const,
                releasesFolder: 'releases',
                states: RELEASE_STATES,
                workingFolder: 'active',
            })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles.slice(0, 2), workingFolder: 'design/active' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const snapshot = await service.releases.completeRelease('v1', [])

        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({
            branch: 'main',
            message: 'Complete release v1',
            moves: [
                {
                    content: finalColumnFile.content,
                    fromPath: 'design/active/F-1-root.md',
                    sha: undefined,
                    toPath: 'design/releases/v1/F-1-root.md',
                },
            ],
        }))
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
        expect(storage.loadProject).toHaveBeenCalledOnce()
        expect(storage.listRepositoryFiles).toHaveBeenCalledTimes(3)
        if (!snapshot) throw new Error('Expected release completion to return a snapshot')

        expect(snapshot.activeCards.map((card) => card.path)).toEqual(['design/active/F-2-imported.md'])
        expect(snapshot.backgroundCards.map((card) => card.path)).toContain('design/releases/v1/F-1-root.md')
    })

    it('blocks release completion when one active card has an assigned worktree', async () => {
        configService.init()
        const assignedCard: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: done\nworktree: 1\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [assignedCard], workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [assignedCard], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('v1', [])).rejects.toThrow(
            'Cannot complete release. Unassign worktrees from cards: F-1.',
        )
        expect(storage.moveFiles).not.toHaveBeenCalled()
        expect(storage.push).not.toHaveBeenCalled()
    })

    it('rejects release completion while a target card action owns its run lock', async () => {
        configService.init()
        const finalColumnFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: done\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }
        const acquireReleaseCardLocks = vi.fn(async () => {
            throw new Error('Cannot complete release while a target card has a running action')
        })
        window.md2Actions = {
            acquireReleaseCardLocks,
            onActionRun: vi.fn(() => vi.fn()),
            releaseReleaseCardLocks: vi.fn(),
        } as never
        const storage = createStorage({
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [finalColumnFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })

        await expect(service.releases.completeRelease('v1', []))
            .rejects.toThrow('Cannot complete release while a target card has a running action')

        expect(acquireReleaseCardLocks).toHaveBeenCalledWith(['root-card'])
        expect(storage.commit).not.toHaveBeenCalled()
    })

    it('lists only assigned release cards and blocks release completion before commit or push', async () => {
        configService.init()
        const activeCards: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ninternalId: first-card\ntitle: First\nstatus: active\nworktree: 1\n---\n\n# First',
                path: 'design/F-1-first.md',
            },
            {
                content: '---\nid: B-12\ninternalId: second-card\ntitle: Second\nstatus: done\nworktree: 2\n---\n\n# Second',
                path: 'design/B-12-second.md',
            },
            {
                content: '---\nid: F-3\ninternalId: primary-card\ntitle: Primary\nstatus: done\n---\n\n# Primary',
                path: 'design/F-3-primary.md',
            },
        ]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: activeCards, workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: activeCards, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('v1', [])).rejects.toThrow(
            'Cannot complete release. Unassign worktrees from cards: B-12.',
        )
        expect(storage.commit).not.toHaveBeenCalled()
        expect(storage.moveFiles).not.toHaveBeenCalled()
        expect(storage.push).not.toHaveBeenCalled()
    })

    it('loads referenced assets and includes them in the release move batch', async () => {
        configService.init()
        const releaseFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: done\n---\n\n# Root\n\n![note](note.png)', path: 'design/F-1-root.md' },
        ]
        const archivedFiles: MarkdownFile[] = [
            { content: releaseFiles[0].content, path: 'history/v1/F-1-root.md' },
        ]
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md', 'design/note.png']),
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: releaseFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
            loadProjectAsset: vi.fn(async () => ({
                content: 'aW1hZ2U=',
                contentType: 'image/png',
                encoding: 'base64' as const,
                path: 'design/note.png',
            })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.releases.completeRelease('v1', [])

        expect(storage.loadProjectAsset).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'design/note.png')
        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({
            branch: 'main',
            message: 'Complete release v1',
            moves: [
                {
                    content: releaseFiles[0].content,
                    fromPath: 'design/F-1-root.md',
                    sha: undefined,
                    toPath: 'history/v1/F-1-root.md',
                },
                {
                    content: 'aW1hZ2U=',
                    encoding: 'base64',
                    fromPath: 'design/note.png',
                    sha: undefined,
                    toPath: 'history/v1/note.png',
                },
            ],
        }))
    })

    it('loads arbitrary copied card references and rewrites the released reference path', async () => {
        configService.init()
        const cardContent = [
            '---',
            'id: F-1',
            'internalId: root-card',
            'title: Root',
            'status: done',
            'references:',
            '  - design/manual.pdf',
            '---',
            '',
            '# Root',
        ].join('\n')
        const releaseFiles: MarkdownFile[] = [{ content: cardContent, path: 'design/F-1-root.md' }]
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md', 'design/manual.pdf']),
            loadProject: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
            loadProjectAsset: vi.fn(async () => ({
                content: 'AAECAw==',
                contentType: 'application/pdf',
                encoding: 'base64' as const,
                path: 'design/manual.pdf',
            })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.releases.completeRelease('v1', [])

        expect(storage.loadProjectAsset).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'design/manual.pdf')
        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({
            branch: 'main',
            message: 'Complete release v1',
            moves: [
                {
                    content: cardContent.replace('design/manual.pdf', 'history/v1/manual.pdf'),
                    fromPath: 'design/F-1-root.md',
                    sha: undefined,
                    toPath: 'history/v1/F-1-root.md',
                },
                {
                    content: 'AAECAw==',
                    encoding: 'base64',
                    fromPath: 'design/manual.pdf',
                    sha: undefined,
                    toPath: 'history/v1/manual.pdf',
                },
            ],
        }))
    })

    it('loads and moves card activity beside the released card in the same batch', async () => {
        configService.init()
        const activityPath = 'activity/card__root-card.json'
        const activityContent = JSON.stringify({
            actionSettings: {},
            conversations: [{
                cardInternalId: 'root-card',
                completedAt: '2026-08-05T12:01:00.000Z',
                entries: [],
                id: 'conversation-1',
                providerSessions: [],
                startedAt: '2026-08-05T12:00:00.000Z',
                status: 'completed',
            }],
            origin: { cardInternalId: 'root-card', kind: 'card' },
            records: [],
            version: 4,
        })
        const cardContent = [
            '---',
            'id: F-1',
            'internalId: root-card',
            'title: Root',
            'status: done',
            'agents:',
            `  - ${activityPath}#conversation=conversation-1`,
            '---',
            '# Root',
        ].join('\n')
        const releaseFiles: MarkdownFile[] = [{ content: cardContent, path: 'design/F-1-root.md' }]
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => [releaseFiles[0].path, activityPath]),
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: releaseFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: [], workingFolder: 'design' }),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => path === activityPath
                ? { content: activityContent, path }
                : { content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()), path }),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.releases.completeRelease('v1', [])

        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({
            branch: 'main',
            message: 'Complete release v1',
            moves: [
                expect.objectContaining({
                    content: expect.stringContaining('history/v1/card__root-card.json'),
                    fromPath: 'design/F-1-root.md',
                    toPath: 'history/v1/F-1-root.md',
                }),
                {
                    content: activityContent,
                    fromPath: activityPath,
                    sha: undefined,
                    toPath: 'history/v1/card__root-card.json',
                },
            ],
        }))
    })

    it('aborts before moving files when referenced activity cannot be loaded', async () => {
        configService.init()
        const activityPath = 'activity/card__root-card.json'
        const cardFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: done\nagents:\n  - ${activityPath}#conversation=conversation-1\n---\n# Root`,
            path: 'design/F-1-root.md',
        }
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => [cardFile.path, activityPath]),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadTextFile: vi.fn(async () => {
                throw new Error('Activity read failed')
            }),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('v1', [])).rejects.toThrow('Activity read failed')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('commits one immutable release usage entry without changing project usage', async () => {
        configService.init()
        const activityPath = 'design/activity/card__root-card.json'
        const cardFile: MarkdownFile = {
            content: `---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: done\nagents:\n  - ${activityPath}\n---\n# Root`,
            path: 'design/F-1-root.md',
        }
        const activityValue = createActivityFile({ cardInternalId: 'root-card', kind: 'card' })
        activityValue.conversations.push({
            actionId: 'review', cardInternalId: 'root-card', cardPath: cardFile.path,
            completedAt: '2026-08-17T10:01:00.000Z', entries: [], hasExplicitTitle: true,
            id: 'conversation-1', providerSessions: [], startedAt: '2026-08-17T10:00:00.000Z',
            status: 'completed', title: 'Review',
            usage: { cachedInputTokens: 2, inputTokens: 3, outputTokens: 4, reasoningTokens: 1, totalTokens: 10 },
            usageSchemaVersion: 1, viewed: true,
        })
        const activityContent = JSON.stringify(activityValue)
        const summaryContent = serializeAgentTokenUsageSummary(createAgentTokenUsageSummary(legacySummaryUsage(50)))
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => [cardFile.path, activityPath]),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => (
                path === activityPath ? { content: activityContent, path } : { content: summaryContent, path }
            )),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await service.releases.completeRelease('v1', [])

        const releaseCommit = vi.mocked(storage.commit).mock.calls
            .map(([request]) => request)
            .find(({ message }) => message === 'Complete release v1')
        if (!releaseCommit) throw new Error('Missing release commit')
        const committedSummary = JSON.parse(releaseCommit.files[0].content)
        expect(committedSummary.projectUsage.totalTokens).toBe(50)
        expect(committedSummary.releases.v1).toMatchObject({
            cachedInputTokens: 2, inputTokens: 3, legacyTotalTokens: 0,
            outputTokens: 4, reasoningTokens: 1, totalTokens: 10,
        })
        const committedStats = parseProjectStatsFile(releaseCommit.files[1].content, 'project_stats.json')
        expect(releaseCommit.files[1].path).toBe('project_stats.json')
        expect(committedStats.releases.v1.conversations).toEqual([expect.objectContaining({
            identity: 'card:root-card:conversation-1',
            totalTokens: 10,
        })])
        expect(releaseCommit.files[1].content).not.toContain('entries')
    })

    it('refuses a release while any agent run is in flight, whichever card or project it belongs to', async () => {
        configService.init()
        const finalColumnFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: done\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }
        const acquireReleaseCardLocks = vi.fn(async () => 'lease')
        window.md2Actions = {
            acquireReleaseCardLocks,
            listActiveActionRuns: vi.fn(async () => [
                { label: 'Review project', runId: 'run-1' },
                { label: 'Implement F-9', runId: 'run-2' },
            ]),
            onActionRun: vi.fn(() => vi.fn()),
            releaseReleaseCardLocks: vi.fn(),
        } as never
        const storage = createStorage({
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [finalColumnFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })

        await expect(service.releases.completeRelease('v1', [])).rejects.toThrow(
            'Cannot complete release while agent actions are running: Review project, Implement F-9',
        )
        expect(acquireReleaseCardLocks).not.toHaveBeenCalled()
        expect(storage.commit).not.toHaveBeenCalled()
    })

    it('archives terminal project agent activity and leaves the rest in the project activity file', async () => {
        configService.init()
        const projectActivityPath = 'activity/project.json'
        const cardFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: done\n---\n# Root',
            path: 'design/F-1-root.md',
        }
        const projectActivity = createActivityFile({ kind: 'project' })
        projectActivity.conversations.push({
            actionId: 'review', cardInternalId: null, cardPath: null,
            completedAt: '2026-08-17T10:01:00.000Z', entries: [], hasExplicitTitle: true,
            id: 'conversation-done', providerSessions: [], startedAt: '2026-08-17T10:00:00.000Z',
            status: 'completed', title: 'Review',
            usage: { cachedInputTokens: 2, inputTokens: 3, outputTokens: 4, reasoningTokens: 1, totalTokens: 10 },
            usageSchemaVersion: 1, viewed: true,
        }, {
            actionId: 'build', cardInternalId: null, cardPath: null,
            completedAt: null, entries: [], hasExplicitTitle: true,
            id: 'conversation-live', providerSessions: [], startedAt: '2026-08-17T11:00:00.000Z',
            status: 'running', title: 'Build', viewed: true,
        })
        projectActivity.records.push({
            commits: [], completedAt: '2026-08-17T10:01:00.000Z', conversationIds: ['conversation-done'],
            details: { agent: 'claude', model: 'opus', type: 'agent' }, origin: { kind: 'project' },
            rootActionId: 'review', rootActionLabel: 'Review', rootConversationId: 'conversation-done',
            runId: 'run-done', startedAt: '2026-08-17T10:00:00.000Z', status: 'completed',
        }, {
            commits: [], completedAt: '2026-08-17T11:01:00.000Z', conversationIds: ['conversation-live', 'conversation-done'],
            details: { agent: 'claude', model: 'opus', type: 'agent' }, origin: { kind: 'project' },
            rootActionId: 'build', rootActionLabel: 'Build', rootConversationId: 'conversation-live',
            runId: 'run-straddling', startedAt: '2026-08-17T11:00:00.000Z', status: 'completed',
        })
        const projectActivityContent = JSON.stringify(projectActivity)
        const summaryContent = serializeAgentTokenUsageSummary(createAgentTokenUsageSummary(legacySummaryUsage(50)))
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => [cardFile.path, projectActivityPath]),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => (
                path === projectActivityPath ? { content: projectActivityContent, path } : { content: summaryContent, path }
            )),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await service.releases.completeRelease('v1', [], true)

        const releaseCommit = vi.mocked(storage.commit).mock.calls
            .map(([request]) => request)
            .find(({ message }) => message === 'Complete release v1')
        if (!releaseCommit) throw new Error('Missing release commit')
        const archivedFile = releaseCommit.files.find(({ path }) => path === 'history/v1/project.json')
        const keptFile = releaseCommit.files.find(({ path }) => path === projectActivityPath)
        if (!archivedFile || !keptFile) throw new Error('Missing archived or kept project activity file')
        const archived = JSON.parse(archivedFile.content)
        const kept = JSON.parse(keptFile.content)
        expect(archived.conversations.map((conversation: { id: string }) => conversation.id)).toEqual(['conversation-done'])
        expect(archived.records.map((record: { runId: string }) => record.runId)).toEqual(['run-done'])
        expect(kept.conversations.map((conversation: { id: string }) => conversation.id)).toEqual(['conversation-live'])
        expect(kept.records.map((record: { runId: string }) => record.runId)).toEqual(['run-straddling'])
        expect(releaseCommit.moves?.map(({ toPath }) => toPath)).toEqual(['history/v1/F-1-root.md'])

        const committedSummary = JSON.parse(releaseCommit.files[0].content)
        expect(committedSummary.projectUsage.totalTokens).toBe(50)
        expect(committedSummary.releases.v1).toMatchObject({ inputTokens: 3, outputTokens: 4, totalTokens: 10 })
        const committedStats = parseProjectStatsFile(releaseCommit.files[1].content, 'project_stats.json')
        expect(committedStats.releases.v1.conversations).toEqual([expect.objectContaining({
            identity: 'project:conversation-done',
            totalTokens: 10,
        })])
        expect(committedStats.releases.v1.actions).toEqual([expect.objectContaining({ identity: 'project:run-done' })])
    })

    it('leaves the project activity file untouched when the release does not include it', async () => {
        configService.init()
        const projectActivityPath = 'activity/project.json'
        const cardFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: done\n---\n# Root',
            path: 'design/F-1-root.md',
        }
        const projectActivity = createActivityFile({ kind: 'project' })
        projectActivity.conversations.push({
            actionId: 'review', cardInternalId: null, cardPath: null,
            completedAt: '2026-08-17T10:01:00.000Z', entries: [], hasExplicitTitle: true,
            id: 'conversation-done', providerSessions: [], startedAt: '2026-08-17T10:00:00.000Z',
            status: 'completed', title: 'Review', viewed: true,
        })
        const summaryContent = serializeAgentTokenUsageSummary(createAgentTokenUsageSummary(legacySummaryUsage(50)))
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => [cardFile.path, projectActivityPath]),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => (
                path === projectActivityPath ? { content: JSON.stringify(projectActivity), path } : { content: summaryContent, path }
            )),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await service.releases.completeRelease('v1', [])

        const releaseCommit = vi.mocked(storage.commit).mock.calls
            .map(([request]) => request)
            .find(({ message }) => message === 'Complete release v1')
        if (!releaseCommit) throw new Error('Missing release commit')
        expect(releaseCommit.files.map(({ path }) => path)).toEqual(['agent_token_usage.json', 'project_stats.json'])
    })

    it('writes no project activity file when the release finds nothing archivable', async () => {
        configService.init()
        const projectActivityPath = 'activity/project.json'
        const cardFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: done\n---\n# Root',
            path: 'design/F-1-root.md',
        }
        const projectActivity = createActivityFile({ kind: 'project' })
        projectActivity.conversations.push({
            actionId: 'build', cardInternalId: null, cardPath: null,
            completedAt: null, entries: [], hasExplicitTitle: true,
            id: 'conversation-live', providerSessions: [], startedAt: '2026-08-17T11:00:00.000Z',
            status: 'running', title: 'Build', viewed: true,
        })
        const summaryContent = serializeAgentTokenUsageSummary(createAgentTokenUsageSummary(legacySummaryUsage(50)))
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => [cardFile.path, projectActivityPath]),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => (
                path === projectActivityPath ? { content: JSON.stringify(projectActivity), path } : { content: summaryContent, path }
            )),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await service.releases.completeRelease('v1', [], true)

        const releaseCommit = vi.mocked(storage.commit).mock.calls
            .map(([request]) => request)
            .find(({ message }) => message === 'Complete release v1')
        if (!releaseCommit) throw new Error('Missing release commit')
        expect(releaseCommit.files.map(({ path }) => path)).toEqual(['agent_token_usage.json', 'project_stats.json'])
    })

    it('rejects invalid release names before moving files', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('bad/name', [])).rejects.toThrow('Release name may contain only')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('rejects release completion when the final column has no cards', async () => {
        configService.init()
        const storage = createStorage({loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' }))})
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('v1', [])).rejects.toThrow('without cards in the final column: done')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('rejects duplicate release folders before moving files', async () => {
        configService.init()
        const finalColumnFile = { ...files[0], content: files[0].content.replace('status: active', 'status: done') }
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md', 'history/v1/F-9.md']),
            loadProject: vi.fn(async () => ({
                files: [finalColumnFile, ...storageFiles.slice(1), { content: '# Archived', path: 'history/v1/F-9.md' }],
                workingFolder: 'design',
            })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [finalColumnFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('v1', [])).rejects.toThrow('Release already exists: v1')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('leaves release completion unpushed in manual mode', async () => {
        configService.init()
        const finalColumnFile = { ...files[0], content: files[0].content.replace('status: active', 'status: done') }
        const archivedFiles: MarkdownFile[] = [{ content: finalColumnFile.content, path: 'history/v1/F-1-root.md' }]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: [finalColumnFile, ...storageFiles.slice(1)], workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
            loadProjectConfig: vi.fn(async () => ({
                backgroundShade: 'blue' as const,
                projectFolder: '',
                pushMode: 'manual' as const,
                states: RELEASE_STATES,
                workingFolder: 'design',
            })),
            loadProjectRoot: vi.fn(async () => ({ files: [finalColumnFile], workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.releases.completeRelease('v1', [])

        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({ message: 'Complete release v1' }))
        expect(storage.push).not.toHaveBeenCalled()
    })

    it('blocks release preparation while release cards have assigned worktrees', async () => {
        configService.init()
        const assignedFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: one\ntitle: One\nstatus: done\nworktree: 1\n---\n# One', path: 'design/F-1-one.md' },
            { content: '---\nid: F-2\ninternalId: two\ntitle: Two\nstatus: active\nworktree: 2\n---\n# Two', path: 'design/F-2-two.md' },
            { content: '---\nid: F-3\ninternalId: three\ntitle: Three\nstatus: done\nworktree: 3\n---\n# Three', path: 'design/F-3-three.md' },
        ]
        const storage = createStorage({
            deleteLocalBranch: vi.fn(async () => undefined),
            loadProject: vi.fn(async () => ({ files: assignedFiles, workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: assignedFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        vi.clearAllMocks()

        const message = 'Cannot complete release. Unassign worktrees from cards: F-1, F-3.'
        await expect(service.releases.getReleaseBranchCandidates()).rejects.toThrow(message)
        expect(storage.commit).not.toHaveBeenCalled()
        expect(storage.moveFiles).not.toHaveBeenCalled()
        expect(storage.push).not.toHaveBeenCalled()
        expect(storage.deleteLocalBranch).not.toHaveBeenCalled()
    })

    it('ignores assigned worktrees outside the final column during release preparation and completion', async () => {
        configService.init()
        const releaseFile: MarkdownFile = {
            content: '---\nid: F-1\ninternalId: one\ntitle: One\nstatus: done\nbranch: f-1\n---\n# One',
            path: 'design/active/F-1-one.md',
        }
        const nonReleaseFile: MarkdownFile = {
            content: '---\nid: B-12\ninternalId: two\ntitle: Two\nstatus: active\nworktree: 2\nbranch: b-12\n---\n# Two',
            path: 'design/active/B-12-two.md',
        }
        const releaseFiles = [releaseFile, nonReleaseFile]
        const storage = createStorage({
            deleteLocalBranch: vi.fn(async () => undefined),
            listBranches: vi.fn(async () => [{ name: 'main' }, { name: 'f-1' }, { name: 'b-12' }]),
            listRepositoryFiles: vi.fn(async () => [
                'design/agent_token_usage.json',
                releaseFile.path,
                nonReleaseFile.path,
            ]),
            loadProject: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({
                projectFolder: 'design',
                releasesFolder: 'releases',
                states: RELEASE_STATES,
                workingFolder: 'active',
            })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design/active' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.getReleaseBranchCandidates()).resolves.toEqual([
            { branchName: 'f-1', cardId: 'F-1', cardPath: releaseFile.path },
        ])
        const snapshot = await service.releases.completeRelease('v1', [])
        if (!snapshot) throw new Error('Expected release completion to return a snapshot')

        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({
            message: 'Complete release v1',
            moves: [expect.objectContaining({
                fromPath: releaseFile.path,
                toPath: 'design/releases/v1/F-1-one.md',
            })],
        }))
        expect(snapshot.activeCards.map((card) => card.path)).toEqual([nonReleaseFile.path])
        expect(snapshot.backgroundCards.map((card) => card.path)).toContain('design/releases/v1/F-1-one.md')
        expect(snapshot.backgroundCards.map((card) => card.path)).not.toContain(nonReleaseFile.path)
    })

    it('lists only existing local branches for cards in the current release', async () => {
        configService.init()
        const releaseFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: one\ntitle: One\nstatus: done\nbranch: f-1\n---\n# One', path: 'design/F-1.md' },
            { content: '---\nid: F-2\ninternalId: two\ntitle: Two\nstatus: active\nbranch: f-2\n---\n# Two', path: 'design/F-2.md' },
            { content: '---\nid: F-3\ninternalId: three\ntitle: Three\nstatus: done\nbranch: missing\n---\n# Three', path: 'design/F-3.md' },
        ]
        const storage = createStorage({
            deleteLocalBranch: vi.fn(async () => undefined),
            listBranches: vi.fn(async () => [{ name: 'main' }, { name: 'f-1' }, { name: 'f-2' }]),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.getReleaseBranchCandidates()).resolves.toEqual([
            { branchName: 'f-1', cardId: 'F-1', cardPath: 'design/F-1.md' },
        ])
    })

    it('deletes selected branches after release push and clears only successful branch metadata', async () => {
        configService.init()
        const releaseFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: one\ntitle: One\nstatus: done\nbranch: f-1\n---\n# One', path: 'design/F-1.md' },
            { content: '---\nid: F-2\ninternalId: two\ntitle: Two\nstatus: done\nbranch: f-2\n---\n# Two', path: 'design/F-2.md' },
        ]
        const archivedFiles = releaseFiles.map((file) => ({ ...file, path: `history/v1/${file.path.split('/').at(-1)}` }))
        const commit = vi.fn<StorageService['commit']>(async (request) => request.files)
        const deleteLocalBranch = vi.fn(async () => undefined)
        const push = vi.fn(async () => undefined)
        const storage = createStorage({
            commit,
            deleteLocalBranch,
            listBranches: vi.fn(async () => [{ name: 'main' }, { name: 'f-1' }, { name: 'f-2' }]),
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: releaseFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', pushMode: 'auto' as const, states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
            push,
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await service.releases.completeRelease('v1', ['f-1'])

        expect(deleteLocalBranch).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'f-1')
        expect(deleteLocalBranch).not.toHaveBeenCalledWith(expect.anything(), 'f-2')
        expect(push.mock.invocationCallOrder[0]).toBeLessThan(deleteLocalBranch.mock.invocationCallOrder[0])
        expect(deleteLocalBranch.mock.invocationCallOrder[0]).toBeLessThan(commit.mock.invocationCallOrder.at(-1) ?? 0)
        expect(commit).toHaveBeenLastCalledWith({
            branch: 'main',
            files: [{ content: expect.not.stringContaining('branch: f-1'), path: 'history/v1/F-1.md' }],
            message: 'Clear deleted release branches',
        })
    })

    it('deletes no branch when automatic release push fails', async () => {
        configService.init()
        const releaseFile = { content: '---\nid: F-1\ninternalId: one\ntitle: One\nstatus: done\nbranch: f-1\n---\n# One', path: 'design/F-1.md' }
        const storage = createStorage({
            deleteLocalBranch: vi.fn(async () => undefined),
            listBranches: vi.fn(async () => [{ name: 'f-1' }]),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', pushMode: 'auto' as const, states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [releaseFile], workingFolder: 'design' })),
            push: vi.fn(async () => { throw new Error('push failed') }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('v1', ['f-1'])).rejects.toThrow('push failed')
        expect(storage.deleteLocalBranch).not.toHaveBeenCalled()
    })

    it('attempts every selected branch and reports each branch not deleted', async () => {
        configService.init()
        const releaseFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: one\ntitle: One\nstatus: done\nbranch: f-1\n---\n# One', path: 'design/F-1.md' },
            { content: '---\nid: F-2\ninternalId: two\ntitle: Two\nstatus: done\nbranch: f-2\n---\n# Two', path: 'design/F-2.md' },
        ]
        const deleteLocalBranch = vi.fn(async (_project, branchName: string) => {
            if (branchName === 'f-1') throw new Error('locked')
        })
        const storage = createStorage({
            deleteLocalBranch,
            listBranches: vi.fn(async () => [{ name: 'f-1' }, { name: 'f-2' }]),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', pushMode: 'manual' as const, states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.releases.completeRelease('v1', ['f-1', 'f-2'])).rejects.toThrow('f-1: locked')
        expect(deleteLocalBranch).toHaveBeenCalledTimes(2)
    })
})
