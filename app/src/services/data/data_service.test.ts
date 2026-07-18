import { afterEach, describe, expect, it, vi } from 'vitest'
import { GithubUnauthorizedError } from '../../auth/github_api_client'
import { configService } from '../config/config_service'
import { actionService } from '../actions/action_service'
import { DataService, type LocalSaveState } from './data_service'
import { GithubStorageService } from '../github/github_storage_service'
import { openFilesService } from '.././open_files_service'
import {
    createDeferred,
    createGithubRawResponse,
    createGithubResponse,
    createGithubStatusResponse,
    createStorage,
    files,
    githubProject,
} from '.././test_support/data_service_test_support'

describe('DataService', () => {
    afterEach(() => {
        vi.useRealTimers()
        delete window.md2Actions
        configService.clear()
        openFilesService.clear()
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
        const service = new DataService()
        service.init({ storage: githubStorage })

        await expect(service.projectLoading.openProject(githubProject)).rejects.toBeInstanceOf(GithubUnauthorizedError)
        expect(handleUnauthorized).toHaveBeenCalledTimes(1)
    })

    it('distinguishes queued dirty changes from active saving', async () => {
        vi.useFakeTimers()
        configService.init()
        const commit = createDeferred<never[]>()
        const storage = createStorage({ commit: vi.fn(() => commit.promise) })
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        const saveStates: LocalSaveState[] = []
        service.addEventListener('changed', () => saveStates.push(service.getState().localSaveState))

        await service.persistActionFile({ content: '{}', path: 'actions/review.json' })
        expect(service.getState().hasPendingSave).toBe(true)
        expect(service.getState().localSaveState).toBe('dirty')
        expect(storage.commit).not.toHaveBeenCalled()

        const flush = service.flushPendingChanges()
        await vi.waitFor(() => expect(storage.commit).toHaveBeenCalledTimes(1))
        expect(service.getState().localSaveState).toBe('saving')

        commit.resolve([])
        await flush
        expect(service.getState().hasPendingSave).toBe(false)
        expect(service.getState().localSaveState).toBe('saved')
        expect(saveStates).toContain('dirty')
        expect(saveStates).toContain('saving')
        expect(saveStates.at(-1)).toBe('saved')
    })

    it('discards queued action persistence before lifecycle flushing', async () => {
        vi.useFakeTimers()
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        await service.persistActionFile({ content: '{"label":"Draft"}', path: 'actions/review.json' })

        expect(service.hasPendingActionFile('actions/review.json')).toBe(true)
        service.discardPendingActionFile('actions/review.json')
        await service.flushPendingChanges()
        await vi.advanceTimersByTimeAsync(30000)

        expect(service.hasPendingActionFile('actions/review.json')).toBe(false)
        expect(storage.commit).not.toHaveBeenCalled()
    })

    it('coalesces every action text category and pushes once per configured batch interval', async () => {
        vi.useFakeTimers()
        configService.init()
        configService.set('react.autoCommitDelayMs', 2000)
        const storage = createStorage()
        const service = new DataService()
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

        const review = actionService.getDraft('actions/review.json').definition
        openFilesService.openFile('actions/review.json')
        actionService.updateDraft('actions/review.json', { ...review, label: 'Review code' })
        actionService.updateDraft('actions/review.json', { ...review, description: 'Review changed files', label: 'Review code' })
        actionService.updateDraft('actions/review.json', { ...review, description: 'Review changed files', label: 'Review code', prompt: 'Review carefully' })
        actionService.updateDraft('actions/review.json', {
            ...review,
            appliesTo: { worktreeError: 'missing' },
            description: 'Review changed files',
            label: 'Review code',
            on: [{ actionId: 'test', condition: 'failed' }],
            phrases: [{ text: 'Run all tests', title: 'Tests' }],
            prompt: 'Review carefully',
        })
        const command = actionService.getDraft('actions/test.json').definition
        actionService.updateDraft('actions/test.json', { ...command, command: 'npm run test' })
        await actionService.flushDrafts()

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
        expect(openFilesService.getSnapshot().activePath).toBe('actions/review-code.json')

        const latestReview = actionService.getDraft('actions/review-code.json').definition
        actionService.updateDraft('actions/review-code.json', { ...latestReview, prompt: 'Review after pause' })
        await actionService.flushDrafts()
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
        const service = new DataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })
        openFilesService.openFile('actions/test-1.json')

        actionService.updateDraft('actions/test-1.json', renamedDefinition)
        await actionService.flushDrafts()
        await vi.advanceTimersByTimeAsync(2000)
        watchChange({ changeKind: 'removed', path: 'actions/test-1.json' })
        watchChange({ changeKind: 'added', path: 'actions/test-1b.json' })
        await vi.advanceTimersByTimeAsync(150)
        commit.resolve([])

        await vi.waitFor(() => {
            expect(actionService.getActionByPath('actions/test-1b.json')?.label).toBe('Test 1b')
            expect(actionService.getDraft('actions/test-1b.json')).toMatchObject({ deleted: false })
            expect(openFilesService.getSnapshot().activePath).toBe('actions/test-1b.json')
        })
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
                    tree: [{ path: 'design/F-1-root.md', sha: 'sha-1', type: 'blob' }],
                    truncated: false,
                })
            }
            if (url.includes('/git/blobs/sha-1') && init.method !== 'POST') return createGithubRawResponse(files[0].content)
            if (url.includes('/git/blobs') && init.method === 'POST') return createGithubStatusResponse(401)

            return createGithubResponse([])
        })
        const githubStorage = new GithubStorageService()
        githubStorage.init({ accessToken: 'token', fetchImplementation, onUnauthorized: handleUnauthorized })
        const service = new DataService()
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
        const service = new DataService()
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
        const service = new DataService()
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
