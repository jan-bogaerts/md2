import { afterEach, describe, expect, it, vi } from 'vitest'
import { GithubUnauthorizedError } from '../../auth/github_api_client'
import { configService } from '../config/config_service'
import { actionService } from '../actions/action_service'
import { projectPersistenceService } from '../project/project_persistence_service'
import { GithubStorageService } from '../github/github_storage_service'
import { openFilesService } from '../open_files_service'
import {
    createDeferred,
    createDataService,
    createGithubRawResponse,
    createGithubResponse,
    createGithubStatusResponse,
    createStorage,
    files,
    githubProject,
} from '../test_support/data_service_test_support'

describe('DataService', () => {
    afterEach(() => {
        vi.useRealTimers()
        delete window.md2Actions
        actionService.clear()
        configService.clear()
        openFilesService.clear()
    })

    it('routes project and card conversation lists through AgentIntegration loaders', async () => {
        const service = createDataService()
        const listProjectAgentConversations = vi.spyOn(service.agents, 'listProjectAgentConversations').mockResolvedValue([])
        const ensureAgentConversationsForCard = vi.spyOn(service.agents, 'ensureAgentConversationsForCard').mockResolvedValue([])

        await expect(service.listAgentConversations({ kind: 'project' })).resolves.toEqual([])
        await expect(service.listAgentConversations({ cardInternalId: 'card-1', kind: 'card' })).resolves.toEqual([])

        expect(listProjectAgentConversations).toHaveBeenCalledOnce()
        expect(ensureAgentConversationsForCard).toHaveBeenCalledWith('card-1')
    })

    it('lists merge-conflict conversations through the project loader without requiring a card id', async () => {
        const service = createDataService()
        const listProjectAgentConversations = vi.spyOn(service.agents, 'listProjectAgentConversations').mockResolvedValue([])

        await expect(
            service.listAgentConversations({ conflictSessionId: 'session-1', kind: 'merge-conflict' }),
        ).resolves.toEqual([])

        expect(listProjectAgentConversations).toHaveBeenCalledOnce()
    })

    it('lists diagram, folder and non-card file conversations through the project loader', async () => {
        const service = createDataService()
        const listProjectAgentConversations = vi.spyOn(service.agents, 'listProjectAgentConversations').mockResolvedValue([])
        const ensureAgentConversationsForCard = vi.spyOn(service.agents, 'ensureAgentConversationsForCard').mockResolvedValue([])

        await expect(service.listAgentConversations({ kind: 'diagram', type: 'root' })).resolves.toEqual([])
        await expect(service.listAgentConversations({ file: 'design', kind: 'folder' })).resolves.toEqual([])
        await expect(service.listAgentConversations({ file: 'design/notes.md', kind: 'file' })).resolves.toEqual([])

        expect(listProjectAgentConversations).toHaveBeenCalledTimes(3)
        expect(ensureAgentConversationsForCard).not.toHaveBeenCalled()
    })

    it('replaces remote storage and project watch without reopening loaded project', async () => {
        configService.init()
        const firstMergeConflictCleanup = vi.fn()
        const firstWatchCleanup = vi.fn()
        const firstStorage = createStorage({
            getMergeConflictSession: vi.fn(async () => null),
            onMergeConflictSessionChanged: vi.fn(() => firstMergeConflictCleanup),
            watchProject: vi.fn(() => firstWatchCleanup),
        })
        const secondStorage = createStorage({
            getMergeConflictSession: vi.fn(async () => null),
            onMergeConflictSessionChanged: vi.fn(() => vi.fn()),
            watchProject: vi.fn(() => vi.fn()),
        })
        const service = createDataService()
        service.init({ storage: firstStorage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const loadedSnapshot = service.getState().snapshot
        const openProject = vi.spyOn(service.projectLoading, 'openProject')

        service.replaceRemoteStorage(secondStorage)

        expect(service.getState().snapshot).toBe(loadedSnapshot)
        expect(firstMergeConflictCleanup).toHaveBeenCalledOnce()
        expect(firstWatchCleanup).toHaveBeenCalledOnce()
        expect(secondStorage.onMergeConflictSessionChanged).toHaveBeenCalledOnce()
        expect(secondStorage.watchProject).toHaveBeenCalledOnce()
        expect(openProject).not.toHaveBeenCalled()
    })

    it('handles GitHub unauthorized once when opening a project gets a 401', async () => {
        configService.init()
        const handleUnauthorized = vi.fn()
        const githubStorage = new GithubStorageService()
        githubStorage.init({
            accessToken: 'token',
            fetchImplementation: vi.fn().mockResolvedValue(createGithubStatusResponse(401)),
            onUnauthorized: handleUnauthorized,
        })
        const service = createDataService()
        service.init({ storage: githubStorage })

        await expect(service.projectLoading.openProject(githubProject)).rejects.toBeInstanceOf(GithubUnauthorizedError)
        expect(handleUnauthorized).toHaveBeenCalledTimes(1)
    })

    it('does not emit project-data changes for queued or active persistence transitions', async () => {
        vi.useFakeTimers()
        configService.init()
        const commit = createDeferred<never[]>()
        const storage = createStorage({ commit: vi.fn(() => commit.promise) })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await vi.advanceTimersByTimeAsync(0)
        const dataChanged = vi.fn()
        service.addEventListener('changed', dataChanged)

        await service.persistActionFile({ content: '{}', path: 'actions/review.json' }, 'review', undefined, vi.fn())
        expect(projectPersistenceService.getSnapshot().hasPendingSave).toBe(true)
        expect(storage.commit).not.toHaveBeenCalled()

        const flush = projectPersistenceService.flushPendingChanges()
        await vi.waitFor(() => expect(storage.commit).toHaveBeenCalledTimes(1))

        commit.resolve([])
        await flush
        expect(projectPersistenceService.getSnapshot().hasPendingSave).toBe(false)
        expect(dataChanged).not.toHaveBeenCalled()
    })

    it('does not forward action-only editor changes through DataService or persistence state', async () => {
        configService.init()
        const service = createDataService()
        service.init({ storage: createStorage() })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        actionService.loadFromFiles([{
            content: JSON.stringify({ command: 'npm test', description: 'Run tests', id: 'test', label: 'Test', type: 'command' }),
            path: 'actions/test.json',
        }])
        const dataChanged = vi.fn()
        const persistenceChanged = vi.fn()
        service.addEventListener('changed', dataChanged)
        projectPersistenceService.addEventListener('changed', persistenceChanged)

        actionService.setActionEditorState('test', { phrases: [], selectedTab: 'settings' })

        expect(dataChanged).not.toHaveBeenCalled()
        expect(persistenceChanged).not.toHaveBeenCalled()
        projectPersistenceService.removeEventListener('changed', persistenceChanged)
    })

    it('discards queued action persistence before lifecycle flushing', async () => {
        vi.useFakeTimers()
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.persistActionFile(
            { content: '{"label":"Draft"}', path: 'actions/review.json' },
            'review',
            undefined,
            vi.fn(),
        )

        expect(service.hasPendingFile('actions/review.json')).toBe(true)
        service.discardPendingFile('actions/review.json')
        await projectPersistenceService.flushPendingChanges()
        await vi.advanceTimersByTimeAsync(30000)

        expect(service.hasPendingFile('actions/review.json')).toBe(false)
        expect(storage.commit).not.toHaveBeenCalled()
    })

    it('coalesces every action text category and pushes once per configured batch interval', async () => {
        vi.useFakeTimers()
        configService.init()
        configService.set('react.autoCommitDelayMs', 2000)
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        actionService.loadFromFiles([
            {
                content: JSON.stringify({
                    description: 'Review files',
                    id: 'review',
                    label: 'Review',
                    phrases: [],
                    prompt: 'Review',
                    type: 'agent',
                }),
                path: 'actions/review.json',
            },
            {
                content: JSON.stringify({ command: 'npm test', description: 'Test files', id: 'test', label: 'Test', phrases: [], type: 'command' }),
                path: 'actions/test.json',
            },
        ])

        const review = actionService.draftStore.getDraft('review').definition
        actionService.draftStore.updateDraft('review', { ...review, label: 'Review code' })
        actionService.draftStore.updateDraft('review', { ...review, description: 'Review changed files', label: 'Review code' })
        actionService.draftStore.updateDraft('review', { ...review, description: 'Review changed files', label: 'Review code', prompt: 'Review carefully' })
        actionService.draftStore.updateDraft('review', {
            ...review,
            appliesTo: { worktreeError: 'missing' },
            description: 'Review changed files',
            label: 'Review code',
            on: [{ actionId: 'test', condition: 'failed' }],
            phrases: [{ text: 'Run all tests', title: 'Tests' }],
            prompt: 'Review carefully',
        })
        const command = actionService.draftStore.getDraft('test').definition
        actionService.draftStore.updateDraft('test', { ...command, command: 'npm run test' })
        await actionService.draftStore.flushDrafts()

        expect(storage.commit).not.toHaveBeenCalled()
        expect(storage.push).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(2000)

        expect(storage.commit).toHaveBeenCalledTimes(1)
        expect(storage.push).toHaveBeenCalledTimes(1)
        const firstRequest = vi.mocked(storage.commit).mock.calls[0][0]
        expect(firstRequest.files).toHaveLength(1)
        expect(firstRequest.moves).toHaveLength(1)
        expect(firstRequest.moves?.[0]).toMatchObject({
            fromPath: 'actions/review.json',
            toPath: 'actions/review-code.json',
        })
        expect(firstRequest.moves?.[0].content).toContain('"text": "Run all tests"')
        expect(firstRequest.files.find(({ path }) => path === 'actions/test.json')?.content).toContain('"command": "npm run test"')

        const latestReview = actionService.draftStore.getDraft('review').definition
        actionService.draftStore.updateDraft('review', { ...latestReview, prompt: 'Review after pause' })
        await actionService.draftStore.flushDrafts()
        await vi.advanceTimersByTimeAsync(2000)

        expect(storage.commit).toHaveBeenCalledTimes(2)
        expect(storage.push).toHaveBeenCalledTimes(2)
    })

    it('finishes an action rename when watcher reload wins the race with commit completion', async () => {
        vi.useFakeTimers()
        configService.init()
        configService.set('react.autoCommitDelayMs', 2000)
        const originalDefinition = {
            command: 'echo test',
            description: 'Test action',
            id: 'test-action',
            label: 'Test 1',
            phrases: [],
            type: 'command' as const,
        }
        const renamedDefinition = { ...originalDefinition, label: 'Test 1b' }
        const commit = createDeferred<never[]>()
        const loadActionFiles = vi.fn()
            .mockResolvedValueOnce([{ content: JSON.stringify(originalDefinition), path: 'actions/test-1.json' }])
            .mockResolvedValueOnce([{ content: JSON.stringify(renamedDefinition), path: 'actions/test-1b.json' }])
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            commit: vi.fn(() => commit.promise),
            loadActionFiles,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        actionService.draftStore.updateDraft('test-action', renamedDefinition)
        await actionService.draftStore.flushDrafts()
        await vi.advanceTimersByTimeAsync(2000)
        watchChange({ changeKind: 'removed', path: 'actions/test-1.json' })
        watchChange({ changeKind: 'added', path: 'actions/test-1b.json' })
        await vi.advanceTimersByTimeAsync(150)
        commit.resolve([])

        await vi.waitFor(() => {
            expect(actionService.getActionByPath('actions/test-1b.json')?.label).toBe('Test 1b')
            expect(actionService.draftStore.getDraft('test-action')).toMatchObject({ deleted: false })
        })
    })

    it('keeps one action through incomplete repair and label change during initial persistence', async () => {
        configService.init()
        const firstCommit = createDeferred<never[]>()
        const storage = createStorage({
            commit: vi.fn()
                .mockImplementationOnce(async () => firstCommit.promise)
                .mockResolvedValueOnce([]),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const { definition, path } = actionService.createDefinition('actions')
        await actionService.saveDefinition(path, definition)

        const initialFlush = projectPersistenceService.flushPendingChanges()
        await vi.waitFor(() => expect(storage.commit).toHaveBeenCalledOnce())
        actionService.draftStore.updateDraft(definition.id, {
            command: '',
            description: definition.description,
            id: definition.id,
            label: definition.label,
            type: 'command',
        })
        actionService.draftStore.updateDraft(definition.id, {
            command: 'npm test',
            description: definition.description,
            id: definition.id,
            label: 'Run tests',
            type: 'command',
        })
        await actionService.draftStore.flushDrafts()

        firstCommit.resolve([])
        await expect(initialFlush).rejects.toThrow('Pending changes remain after flush')
        await projectPersistenceService.flushPendingChanges()

        const requests = vi.mocked(storage.commit).mock.calls.map(([request]) => request)
        expect(requests[0].files).toEqual([expect.objectContaining({ path: 'actions/new-action.json' })])
        expect(requests[1].moves).toEqual([expect.objectContaining({
            fromPath: 'actions/new-action.json',
            toPath: 'actions/run-tests.json',
        })])
        expect(requests[1].moves?.[0].content).toContain('"command": "npm test"')
        expect(actionService.getActions().filter(({ id }) => id === definition.id)).toHaveLength(1)
        expect(actionService.getActionById(definition.id)).toMatchObject({ label: 'Run tests', sourcePath: 'actions/run-tests.json' })

        const persistedFile = { content: requests[1].moves?.[0].content as string, path: 'actions/run-tests.json' }
        actionService.reloadFromFiles(
            [persistedFile],
            [{
                origin: 'local',
                path: persistedFile.path,
                revision: actionService.getPublicationRevision(persistedFile.path),
            }],
        )
        expect(actionService.getActions().filter(({ id }) => id === definition.id)).toHaveLength(1)
    })

    it('reloads project configuration when the watched config file changes', async () => {
        configService.init()
        let watchChange: (event: { changeKind: 'changed'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const loadProjectConfig = vi.fn()
            .mockResolvedValueOnce({ backgroundShade: 'blue' as const, projectFolder: '', pushMode: 'manual' as const, workingFolder: 'design' })
            .mockResolvedValueOnce({ backgroundShade: 'green' as const, projectFolder: '', pushMode: 'auto' as const, workingFolder: 'design' })
        const storage = createStorage({
            loadProjectConfig,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'changed', path: 'md2.config.json' })

        await vi.waitFor(() => {
            expect(configService.getProjectConfig()).toMatchObject({ backgroundShade: 'green', pushMode: 'auto' })
        })
        expect(loadProjectConfig).toHaveBeenCalledTimes(2)
    })

    it('pulls through storage without reloading the project snapshot', async () => {
        configService.init()
        const pull = vi.fn()
        const loadProjectRoot = vi.fn(async () => ({ files: [], workingFolder: 'design' }))
        const storage = createStorage({ loadProjectRoot, pull })
        const service = createDataService()
        service.init({ storage })
        const project = { branch: 'main', id: 'project' }
        await service.projectLoading.openProject(project)

        await service.projectLoading.pull()

        expect(pull).toHaveBeenCalledWith(project)
        expect(loadProjectRoot).toHaveBeenCalledOnce()
    })

    it('handles GitHub unauthorized once when a batched commit gets a 401', async () => {
        configService.init()
        const handleUnauthorized = vi.fn()
        const fetchImplementation = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
            const url = String(input)
            if (url.includes('/contents/md2.config.json')) {
                return createGithubResponse({
                    content: btoa(JSON.stringify({ backgroundShade: 'blue', projectFolder: '', workingFolder: 'design' })),
                    encoding: 'base64',
                    path: 'md2.config.json',
                    sha: 'config-sha',
                })
            }
            if (url.includes('/git/ref/heads/main')) {
                return createGithubResponse({ object: { sha: 'base-commit', type: 'commit' }, ref: 'refs/heads/main' })
            }
            if (url.includes('/git/commits/base-commit')) {
                return createGithubResponse({ sha: 'base-commit', tree: { sha: 'base-tree' } })
            }
            if (url.includes('/git/trees/base-tree')) {
                return createGithubResponse({
                    tree: [
                        { path: 'agent_token_usage.json', sha: 'usage-sha', type: 'blob' },
                        { path: 'design/F-1-root.md', sha: 'sha-1', type: 'blob' },
                    ],
                    truncated: false,
                })
            }
            if (url.includes('/git/blobs/usage-sha') && init.method !== 'POST') {
                return createGithubRawResponse(JSON.stringify({
                    projectUsage: { inputTokens: 0, cacheReadTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
                    releases: {},
                    schemaVersion: 1,
                }))
            }
            if (url.includes('/git/blobs/sha-1') && init.method !== 'POST') return createGithubRawResponse(files[0].content)
            if (url.includes('/git/blobs') && init.method === 'POST') return createGithubStatusResponse(401)

            return createGithubResponse([])
        })
        const githubStorage = new GithubStorageService()
        githubStorage.init({ accessToken: 'token', fetchImplementation, onUnauthorized: handleUnauthorized })
        const service = createDataService()
        service.init({ storage: githubStorage })

        await service.projectLoading.openProject(githubProject)
        service.cards.updateCardBody('design/F-1-root.md', '# Root\n\nChanged')

        await expect(service.cards.flushPendingCommits()).rejects.toBeInstanceOf(GithubUnauthorizedError)
        expect(handleUnauthorized).toHaveBeenCalledTimes(1)
    })

    it('imports Remarkable images into an existing card and commits card, assets and metadata together', async () => {
        configService.init()
        const storage = createStorage()
        const remarkableBridge = {
            importFiles: vi.fn(async () => [
                { content: btoa('img'), modifiedTime: '2026-07-01T10:00:00.000Z', name: 'note.png', sourcePath: '/img/note.png' },
            ]),
            listImageFiles: vi.fn(async () => []),
            testConnection: vi.fn(async () => ({ message: null, ok: true })),
        }
        const service = createDataService()
        service.init({ remarkableBridge, storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        const plan = await service.importRemarkableImages({
            paths: ['/img/note.png'],
            settings: { host: 'remarkable.local', imageFolder: '/img', password: 'secret', port: 22, username: 'root' },
            target: { cardPath: 'design/F-1-root.md', kind: 'existing' },
        })

        expect(remarkableBridge.importFiles).toHaveBeenCalledWith(expect.objectContaining({ paths: ['/img/note.png'] }))
        const commitRequest = vi.mocked(storage.commit).mock.calls[0][0]
        expect(commitRequest.files.map((file) => file.path)).toEqual([
            'design/F-1-root.md',
            'design/note.png',
            'design/.remarkable-import.json',
        ])
        expect(commitRequest.files[1].encoding).toBe('base64')
        expect(plan.importedAssetPaths).toEqual(['design/note.png'])
        expect(storage.push).toHaveBeenCalled()
    })

    it('rejects Remarkable import when no bridge is available', async () => {
        configService.init()
        const storage = createStorage()
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.importRemarkableImages({
            paths: ['/img/note.png'],
            settings: { host: 'remarkable.local', imageFolder: '/img', password: 'secret', port: 22, username: 'root' },
            target: { cardPath: 'design/F-1-root.md', kind: 'existing' },
        })).rejects.toThrow(/Electron local mode/u)

        expect(storage.commit).not.toHaveBeenCalled()
    })

})
