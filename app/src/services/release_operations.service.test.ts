import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownFile, StorageService } from '../data/data_types'
import { configService } from './config/config_service'
import { conversation, createDataService, createStorage, files, storageFiles } from './test_support/data_service_test_support'
import { dialogService } from './dialog_service';
import { projectAgentTokenUsageService } from './agents/project_agent_token_usage_service';
import { createAgentTokenUsageSummary, legacySummaryUsage, serializeAgentTokenUsageSummary } from '../../../shared/agent_token_usage_summary.mjs'
import { createActivityFile } from '../../../shared/card_activity.mjs'
import { parseProjectStatsFile } from '../../../shared/project_stats.mjs'

const RELEASE_STATES = [
    { alwaysVisible: true, state: 'active' },
    { alwaysVisible: true, state: 'done' },
]

/** Models committed file moves so reads from removed source paths fail. */
function createReleaseActivityStorage(archiveProjectActivity: boolean) {
    const cardFiles = ['root-card', 'retained-card'].map((cardInternalId, index) => ({
        content: `---\nid: F-${index + 1}\ninternalId: ${cardInternalId}\ntitle: Card\nstatus: ${index === 0 ? 'done' : 'active'}\nbranch: feature-${index}\nagents:\n  - activity/card__${cardInternalId}.json\n---\n# Card`,
        path: `design/F-${index + 1}-card.md`,
    }));
    const repository = new Map<string, MarkdownFile>(cardFiles.map((file) => [file.path, file]));
    for (const { path, content } of cardFiles) {
        const cardInternalId = content.includes('root-card') ? 'root-card' : 'retained-card';
        const activityPath = `activity/card__${cardInternalId}.json`;
        const activity = createActivityFile({ cardInternalId, kind: 'card' });
        activity.conversations.push({ ...conversation(), cardInternalId, cardPath: path, id: cardInternalId });
        repository.set(activityPath, { content: JSON.stringify(activity), path: activityPath });
    }
    const projectActivity = createActivityFile({ kind: 'project' });
    projectActivity.conversations.push({...conversation(), cardInternalId: null, cardPath: null, id: 'project-kept', completedAt: null, status: 'waitingForInput'});
    if (archiveProjectActivity) {
        projectActivity.conversations.push({ ...conversation(), cardInternalId: null, cardPath: null, id: 'project-done' });
    }
    repository.set('activity/project.json', { content: JSON.stringify(projectActivity), path: 'activity/project.json' });
    repository.set('agent_token_usage.json', {content: serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()), path: 'agent_token_usage.json'});
    const storage = createStorage({
        commit: vi.fn(async ({ files: committedFiles, moves = [] }) => {
            for (const { fromPath, toPath, content } of moves) {
                repository.delete(fromPath);
                repository.set(toPath, { content, path: toPath });
            }
            for (const file of committedFiles) repository.set(file.path, file);
            return committedFiles;
        }),
        deleteLocalBranch: vi.fn(async () => undefined),
        listBranches: vi.fn(async () => [{ name: 'main' }, { name: 'feature-0' }]),
        listRepositoryFiles: vi.fn(async () => [...repository.keys()]),
        listAgentConversationReferences: vi.fn(async () => (
            JSON.parse(repository.get('activity/project.json')!.content).conversations
                .map(({ id }: { id: string }) => `activity/project.json#conversation=${id}`)
        )),
        loadActivityConversations: vi.fn(async (_project, path) => {
            const file = repository.get(path);
            if (!file) throw new Error(`Missing referenced activity file: ${path}`);
            return JSON.parse(file.content).conversations.map((stored: ReturnType<typeof conversation>) => ({...stored, path: `${path}#conversation=${stored.id}`}));
        }),
        loadAgentConversation: vi.fn(async (_project, reference) => {
            const [path, id] = reference.split('#conversation=');
            const stored = JSON.parse(repository.get(path)!.content).conversations
                .find((current: { id: string }) => current.id === id);
            return { ...stored, path: reference };
        }),
        loadProjectConfig: vi.fn(async () => ({
            pinnedConversations: [{ cardInternalId: 'root-card', contextKind: 'card' as const, conversationId: 'root-card' }],
            projectFolder: '', pushMode: 'auto' as const, releasesFolder: 'history', states: RELEASE_STATES, workingFolder: 'design',
        })),
        loadProjectRoot: vi.fn(async () => ({files: [...repository.values()].filter(({ path }) => /^design\/[^/]+\.md$/u.test(path)), workingFolder: 'design'})),
        loadProject: vi.fn(async () => ({files: [...repository.values()].filter(({ path }) => path.endsWith('.md')), workingFolder: 'design'})),
        loadTextFile: vi.fn(async (_project, path) => {
            const file = repository.get(path);
            if (!file) throw new Error(`Missing text file: ${path}`);
            return file;
        }),
    });
    return { repository, storage };
}

describe('ReleaseOperations', () => {
    it.each([false, true])('reloads committed paths with project activity archive=%s and survives another release and reopen', async (archiveProjectActivity) => {
        configService.init();
        const warning = vi.spyOn(dialogService, 'warning');
        const { repository, storage } = createReleaseActivityStorage(archiveProjectActivity);
        const service = createDataService();
        service.init({ storage });
        const project = { branch: 'main', id: 'project' };
        await service.projectLoading.openProject(project);
        await vi.waitFor(() => expect(service.isFullProjectLoaded()).toBe(true));
        await service.agents.hydrateActiveCardConversations();
        await service.agents.ensurePinnedConversationsLoaded();
        const storedConversation = service.agents.getAgentConversations('root-card')[0];
        const reset = vi.spyOn(service.agents, 'resetLoadedConversations');
        const refresh = vi.spyOn(projectAgentTokenUsageService, 'refresh').mockImplementation(async () => {
            const snapshot = service.getState().snapshot!;
            expect(snapshot.repositoryFiles).toContain('history/v1/card__root-card.json');
            expect(snapshot.repositoryFiles).not.toContain('activity/card__root-card.json');
            expect(snapshot.backgroundCards.find(({ header }) => header.internalId === 'root-card')?.header.agentLogReferences)
                .toEqual(['history/v1/card__root-card.json']);
            expect(reset).toHaveBeenCalledOnce();
        });

        await service.releases.completeRelease('v1', []);
        refresh.mockRestore();
        await service.agents.hydrateActiveCardConversations();
        await service.agents.ensurePinnedConversationsLoaded();
        const context = { cardInternalId: 'root-card', file: 'history/v1/F-1-card.md', kind: 'card' as const };
        const archived = await service.listAgentConversations(context);
        expect(archived).toEqual([{ ...storedConversation, path: 'history/v1/card__root-card.json#conversation=root-card' }]);
        expect(service.agents.getPinnedConversationsSnapshot()).toEqual(archived);
        expect(service.agents.getAgentConversations('retained-card')[0].path)
            .toBe('activity/card__retained-card.json#conversation=retained-card');
        expect((await service.listAgentConversations({ kind: 'project' })).map(({ id }) => id))
            .toEqual(['project-kept']);

        const retainedFile = repository.get('design/F-2-card.md')!;
        repository.set(retainedFile.path, { ...retainedFile, content: retainedFile.content.replace('status: active', 'status: done') });
        await service.projectLoading.openProject(project);
        await vi.waitFor(() => expect(service.isFullProjectLoaded()).toBe(true));
        await service.releases.completeRelease('v2', []);
        await service.projectLoading.openProject(project);
        await vi.waitFor(() => expect(service.isFullProjectLoaded()).toBe(true));
        expect(await service.listAgentConversations(context)).toEqual(archived);
        expect((await service.listAgentConversations({ cardInternalId: 'retained-card', kind: 'card', file: 'history/v2/F-2-card.md' }))[0])
            .toMatchObject({ id: 'retained-card', path: 'history/v2/card__retained-card.json#conversation=retained-card' });
        expect(warning).not.toHaveBeenCalled();
    });

    it.each(['commit', 'usage refresh', 'push', 'cleanup', 'metadata commit', 'metadata push'])('preserves appropriate state after %s failure', async (stage) => {
        configService.init();
        const { storage } = createReleaseActivityStorage(true);
        const service = createDataService();
        service.init({ storage });
        await service.projectLoading.openProject({ branch: 'main', id: 'project' });
        await vi.waitFor(() => expect(service.isFullProjectLoaded()).toBe(true));
        await service.agents.hydrateActiveCardConversations();
        const reset = vi.spyOn(service.agents, 'resetLoadedConversations');
        const failure = new Error(`${stage} failed`);
        if (stage === 'commit') vi.mocked(storage.commit).mockRejectedValueOnce(failure);
        if (stage === 'usage refresh') vi.spyOn(projectAgentTokenUsageService, 'refresh').mockRejectedValueOnce(failure);
        if (stage === 'push') vi.mocked(storage.push).mockRejectedValueOnce(failure);
        if (stage === 'cleanup') vi.mocked(storage.deleteLocalBranch!).mockRejectedValueOnce(failure);
        if (stage === 'metadata commit') {
            const commit = vi.mocked(storage.commit);
            commit.mockImplementationOnce(commit.getMockImplementation()!).mockRejectedValueOnce(failure);
        }
        if (stage === 'metadata push') vi.mocked(storage.push).mockResolvedValueOnce(undefined).mockRejectedValueOnce(failure);

        await expect(service.releases.completeRelease('v1', ['feature-0'])).rejects.toThrow(`${stage} failed`);
        const snapshot = service.getState().snapshot!;
        if (stage === 'commit') {
            expect(snapshot.activeCards[0].path).toBe('design/F-1-card.md');
            expect(service.agents.getAgentConversations('root-card')[0].path)
                .toBe('activity/card__root-card.json#conversation=root-card');
            expect(reset).not.toHaveBeenCalled();
        } else {
            expect(snapshot.backgroundCards.find(({ header }) => header.internalId === 'root-card'))
                .toMatchObject({ path: 'history/v1/F-1-card.md', header: { agentLogReferences: ['history/v1/card__root-card.json'] } });
            expect(reset).toHaveBeenCalledOnce();
            if (stage === 'metadata push') {
                expect(snapshot.backgroundCards.find(({ header }) => header.internalId === 'root-card')?.header.branch).toBeNull();
            }
        }
        if (['commit', 'usage refresh', 'push'].includes(stage)) expect(storage.deleteLocalBranch).not.toHaveBeenCalled();
    });

    it.each(['auto', 'manual'] as const)('completes release after missing images with %s push mode', async (pushMode) => {
        configService.init();
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const missingImageError = Object.assign(new Error('Image absent'), { code: 'ENOENT' });
        const releaseFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ninternalId: one\ntitle: One\nstatus: done\nbranch: f-1\nreferences:\n  - design/missing/note.png\n  - design/available/note.png\n---\n![missing](absent.svg)\n![available](available.jpg)\n![shared](shared.webp)',
                path: 'design/F-1-one.md',
            },
            {
                content: '---\nid: F-2\ninternalId: two\ntitle: Two\nstatus: done\nreferences:\n  - design/missing/note.png\n---\n![missing](absent.svg)\n![available](available.jpg)',
                path: 'design/F-2-two.md',
            },
            {
                content: '---\nid: F-3\ninternalId: three\ntitle: Three\nstatus: active\n---\n![shared](shared.webp)',
                path: 'design/F-3-three.md',
            },
        ];
        const activityPath = 'activity/card__one.json';
        const activity = createActivityFile({ cardInternalId: 'one', kind: 'card' });
        activity.conversations.push({
            actionId: 'review', cardInternalId: 'one', cardPath: releaseFiles[0].path,
            completedAt: '2026-08-17T10:01:00.000Z', entries: [], hasExplicitTitle: true,
            id: 'conversation-1', providerSessions: [], startedAt: '2026-08-17T10:00:00.000Z',
            status: 'completed', title: 'Review',
            usage: { cachedInputTokens: 2, inputTokens: 3, outputTokens: 4, reasoningTokens: 1, totalTokens: 10 },
            usageSchemaVersion: 1, viewed: true,
        });
        const missingPaths = ['design/absent.svg', 'design/missing/note.png'];
        const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' };
        const releaseReleaseCardLocks = vi.fn(async () => undefined);
        window.md2Actions = {
            acquireReleaseCardLocks: vi.fn(async () => 'release-lease'),
            onActionRun: vi.fn(() => vi.fn()),
            releaseReleaseCardLocks,
        } as never;
        const storage = createStorage({
            commit: vi.fn<StorageService['commit']>(async (request) => request.files),
            deleteLocalBranch: vi.fn(async () => undefined),
            listBranches: vi.fn(async () => [{ name: 'main' }, { name: 'f-1' }]),
            listRepositoryFiles: vi.fn(async () => ['agent_token_usage.json', ...releaseFiles.map(({ path }) => path), ...missingPaths, activityPath]),
            loadProject: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
            loadProjectAsset: vi.fn(async (_project, path) => {
                if (missingPaths.includes(path)) throw missingImageError;
                return { content: 'aW1hZ2U=', contentType: 'image/png', encoding: 'base64' as const, path };
            }),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', pushMode, states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: releaseFiles, workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => ({
                content: path === activityPath
                    ? JSON.stringify(activity)
                    : serializeAgentTokenUsageSummary(createAgentTokenUsageSummary(legacySummaryUsage(50))),
                path,
            })),
        });
        const service = createDataService();
        service.init({ storage });
        await service.projectLoading.openProject(project);
        await vi.waitFor(() => expect(service.isFullProjectLoaded()).toBe(true));

        const snapshot = await service.releases.completeRelease('v1', ['f-1']);

        const releaseCommit = vi.mocked(storage.commit).mock.calls[0][0];
        expect(releaseCommit.moves?.map(({ fromPath }) => fromPath)).toEqual([
            'design/F-1-one.md', activityPath, 'design/available.jpg', 'design/available/note.png', 'design/F-2-two.md',
        ]);
        expect(releaseCommit.moves?.filter(({ encoding }) => encoding === 'base64')).toEqual([
            expect.objectContaining({ content: 'aW1hZ2U=', fromPath: 'design/available.jpg', toPath: 'history/v1/available.jpg' }),
            expect.objectContaining({ content: 'aW1hZ2U=', fromPath: 'design/available/note.png', toPath: 'history/v1/note.png' }),
        ]);
        expect(releaseCommit.moves?.[0].content).toBe(
            releaseFiles[0].content.replace('design/available/note.png', 'history/v1/note.png'),
        );
        expect(releaseCommit.moves?.at(-1)?.content).toBe(releaseFiles[1].content);
        expect(releaseCommit.files.map(({ path }) => path)).toEqual(['agent_token_usage.json', 'project_stats.json']);
        expect(JSON.parse(releaseCommit.files[0].content)).toMatchObject({
            projectUsage: { totalTokens: 50 },
            releases: { v1: { totalTokens: 10 } },
        });
        expect(parseProjectStatsFile(releaseCommit.files[1].content, 'project_stats.json').releases.v1.conversations)
            .toEqual([expect.objectContaining({ identity: 'card:one:conversation-1', totalTokens: 10 })]);
        expect(storage.loadProjectAsset).toHaveBeenCalledTimes(4);
        expect(storage.loadProjectAsset).not.toHaveBeenCalledWith(project, 'design/shared.webp');
        expect(warning).toHaveBeenCalledTimes(2);
        for (const path of missingPaths) {
            expect(warning).toHaveBeenCalledWith(`Skipping missing release image: ${path}`, missingImageError);
        }
        expect(storage.deleteLocalBranch).toHaveBeenCalledWith(project, 'f-1');
        expect(storage.commit).toHaveBeenLastCalledWith(expect.objectContaining({
            message: 'Clear deleted release branches',
            files: [expect.objectContaining({ content: expect.not.stringContaining('branch: f-1'), path: 'history/v1/F-1-one.md' })],
        }));
        expect(storage.push).toHaveBeenCalledTimes(pushMode === 'auto' ? 2 : 0);
        if (pushMode === 'auto') {
            expect(vi.mocked(storage.push).mock.invocationCallOrder[0])
                .toBeLessThan(vi.mocked(storage.deleteLocalBranch!).mock.invocationCallOrder[0]);
        }
        expect(snapshot?.activeCards.map(({ header }) => header.internalId)).toEqual(['three']);
        expect(snapshot?.backgroundCards.map(({ header }) => header.internalId)).toEqual(expect.arrayContaining(['one', 'two']));
        expect(releaseReleaseCardLocks).toHaveBeenCalledWith('release-lease');
        warning.mockRestore();
    });

    it.each([
        { code: 'EACCES', path: 'design/image.png' },
        { code: 'UNSUPPORTED_ASSET', path: 'design/image.svg' },
        { code: undefined, path: 'design/image.png' },
        { code: 'ENOENT', path: 'design/manual.pdf' },
    ])('rejects asset failure $code for $path and releases locks', async ({ code, path }) => {
        configService.init();
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const failure = Object.assign(new Error('ENOENT: asset load failed'), { code });
        const cardFile = {
            content: `---\nid: F-1\ninternalId: one\ntitle: One\nstatus: done\nreferences:\n  - ${path}\n---\n# One`,
            path: 'design/F-1.md',
        };
        const releaseReleaseCardLocks = vi.fn(async () => undefined);
        window.md2Actions = {
            acquireReleaseCardLocks: vi.fn(async () => 'release-lease'),
            onActionRun: vi.fn(() => vi.fn()), releaseReleaseCardLocks,
        } as never;
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectAsset: vi.fn(async () => { throw failure; }),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
        });
        const service = createDataService();
        service.init({ storage });
        await service.projectLoading.openProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' });
        await vi.waitFor(() => expect(service.isFullProjectLoaded()).toBe(true));

        await expect(service.releases.completeRelease('v1', [])).rejects.toBe(failure);

        expect(storage.commit).not.toHaveBeenCalled();
        expect(storage.push).not.toHaveBeenCalled();
        expect(warning).not.toHaveBeenCalled();
        expect(releaseReleaseCardLocks).toHaveBeenCalledWith('release-lease');
        warning.mockRestore();
    });

    it.each(['activity discovery', 'activity load', 'commit'])('still fails at %s after skipping missing image', async (stage) => {
        configService.init();
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const activityPath = 'activity/card__one.json';
        const failure = Object.assign(new Error('Required file absent'), { code: 'ENOENT' });
        const cardFile = {
            content: `---\nid: F-1\ninternalId: one\ntitle: One\nstatus: done\nagents:\n  - ${activityPath}\n---\n![missing](absent.png)`,
            path: 'design/F-1.md',
        };
        const releaseReleaseCardLocks = vi.fn(async () => undefined);
        window.md2Actions = {
            acquireReleaseCardLocks: vi.fn(async () => 'release-lease'),
            onActionRun: vi.fn(() => vi.fn()), releaseReleaseCardLocks,
        } as never;
        const storage = createStorage({
            commit: vi.fn(async () => { throw failure; }),
            listRepositoryFiles: vi.fn(async () => [
                'agent_token_usage.json', cardFile.path, ...(stage === 'activity discovery' ? [] : [activityPath]),
            ]),
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectAsset: vi.fn(async () => { throw failure; }),
            loadProjectConfig: vi.fn(async () => ({ projectFolder: '', states: RELEASE_STATES, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadTextFile: vi.fn(async (_project, path) => {
                if (stage === 'activity load' && path === activityPath) throw failure;
                return {
                    content: path === activityPath
                        ? JSON.stringify(createActivityFile({ cardInternalId: 'one', kind: 'card' }))
                        : serializeAgentTokenUsageSummary(createAgentTokenUsageSummary()),
                    path,
                };
            }),
        });
        const service = createDataService();
        service.init({ storage });
        await service.projectLoading.openProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' });
        await vi.waitFor(() => expect(service.isFullProjectLoaded()).toBe(true));

        await expect(service.releases.completeRelease('v1', [])).rejects.toThrow(
            stage === 'activity discovery' ? `Missing referenced activity log: ${activityPath}` : failure.message,
        );

        expect(storage.commit).toHaveBeenCalledTimes(stage === 'commit' ? 1 : 0);
        expect(storage.push).not.toHaveBeenCalled();
        expect(warning).toHaveBeenCalledWith('Skipping missing release image: design/absent.png', failure);
        expect(releaseReleaseCardLocks).toHaveBeenCalledWith('release-lease');
        warning.mockRestore();
    });

    afterEach(() => {
        vi.restoreAllMocks();
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

        await service.releases.completeRelease('v1', [])

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

    it('keeps project conversations loadable after a release archives project activity', async () => {
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
        projectActivity.records.push({
            commits: [], completedAt: '2026-08-17T10:01:00.000Z', conversationIds: ['conversation-done'],
            details: { agent: 'claude', model: 'opus', type: 'agent' }, origin: { kind: 'project' },
            rootActionId: 'review', rootActionLabel: 'Review', rootConversationId: 'conversation-done',
            runId: 'run-done', startedAt: '2026-08-17T10:00:00.000Z', status: 'completed',
        })
        const projectActivityContent = JSON.stringify(projectActivity)
        const summaryContent = serializeAgentTokenUsageSummary(createAgentTokenUsageSummary())
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

        await service.releases.completeRelease('v1', [])

        const releaseCommit = vi.mocked(storage.commit).mock.calls
            .map(([request]) => request)
            .find(({ message }) => message === 'Complete release v1')
        expect(releaseCommit?.files.map(({ path }) => path)).toContain('history/v1/project.json')
        await expect(service.listAgentConversations({ kind: 'project' })).resolves.toEqual(expect.any(Array))
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

        await service.releases.completeRelease('v1', [])

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
