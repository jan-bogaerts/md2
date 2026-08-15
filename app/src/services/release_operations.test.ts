import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownFile, StorageService } from '../data/data_types'
import { configService } from './config/config_service'
import { createDataService, createStorage, files, storageFiles } from './test_support/data_service_test_support'

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
        const archivedFiles: MarkdownFile[] = [
            { content: finalColumnFile.content, path: 'design/releases/v1/F-1-root.md' },
            releaseFiles[1],
            files[1],
        ]
        const storage = createStorage({
            listRepositoryFiles: vi.fn()
                .mockResolvedValueOnce(['design/active/F-1-root.md', 'design/active/F-2-imported.md'])
                .mockResolvedValueOnce(['design/active/F-2-imported.md', 'design/releases/v1/F-1-root.md']),
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: releaseFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
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

        expect(storage.moveFiles).toHaveBeenCalledWith({
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
        })
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
        expect(storage.loadProject).toHaveBeenCalledOnce()
        expect(storage.listRepositoryFiles).toHaveBeenCalledOnce()
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

    it('lists every assigned active card and blocks release completion before moving or pushing', async () => {
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
            'Cannot complete release. Unassign worktrees from cards: F-1, B-12.',
        )
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
        expect(storage.moveFiles).toHaveBeenCalledWith({
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
        })
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
        expect(storage.moveFiles).toHaveBeenCalledWith({
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
        })
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
            loadTextFile: vi.fn(async () => ({ content: activityContent, path: activityPath })),
        })
        const service = createDataService()
        service.init({ storage })

        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.releases.completeRelease('v1', [])

        expect(storage.moveFiles).toHaveBeenCalledWith({
            branch: 'main',
            message: 'Complete release v1',
            moves: [
                expect.objectContaining({
                    content: expect.stringContaining('history/v1/card__root-card.json#conversation=conversation-1'),
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
        })
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

        expect(storage.moveFiles).toHaveBeenCalledTimes(1)
        expect(storage.push).not.toHaveBeenCalled()
    })

    it('blocks release preparation and completion while active cards have assigned worktrees', async () => {
        configService.init()
        const assignedFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: one\ntitle: One\nstatus: done\nworktree: 1\n---\n# One', path: 'design/F-1.md' },
            { content: '---\nid: B-12\ninternalId: two\ntitle: Two\nstatus: active\nworktree: 2\n---\n# Two', path: 'design/B-12.md' },
        ]
        const storage = createStorage({
            deleteLocalBranch: vi.fn(async () => undefined),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: assignedFiles, workingFolder: 'design' })),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        const message = 'Cannot complete release. Unassign worktrees from cards: F-1, B-12.'
        await expect(service.releases.getReleaseBranchCandidates()).rejects.toThrow(message)
        await expect(service.releases.completeRelease('v1', [])).rejects.toThrow(message)
        expect(storage.moveFiles).not.toHaveBeenCalled()
        expect(storage.push).not.toHaveBeenCalled()
        expect(storage.deleteLocalBranch).not.toHaveBeenCalled()
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
