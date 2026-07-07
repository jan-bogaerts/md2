import { describe, expect, it, vi } from 'vitest'
import { CommitBatcher } from './commit_batcher'
import { afterEach } from 'vitest'
import { createCardFile, getNextCardNumber } from './card_naming'
import { actionService } from '../services/action_service'
import { actionRunner } from '../services/action_runner'
import { configService } from '../services/config_service'
import { DataService } from '../services/data_service'
import { GithubStorageService } from '../services/github_storage_service'
import { markdownParsingService } from '../services/markdown_parsing_service'
import { telemetryService } from '../services/telemetry_service'
import { GithubUnauthorizedError } from '../auth/github_api_client'
import {
    DEFAULT_CARD_BODY_TEMPLATE,
    DEFAULT_CARD_TYPES,
    type AgentConversation,
    type AgentRunEvent,
    type CommitRequest,
    type MarkdownFile,
    type StorageProjectFiles,
    type StorageService,
} from './data_types'

vi.mock('../services/action_runner', () => ({ actionRunner: { run: vi.fn(async () => ({ logs: [], status: 'completed' })) } }))

const files: MarkdownFile[] = [
    { content: '---\nid: F-1\ntitle: Root\nstatus: active\naffects:\n  - app/src/app.tsx\n---\n\n# Root', path: 'design/F-1-root.md' },
    { content: '# Old', path: 'design/history/F-3-old.md' },
    { content: '# Imported', path: 'design/free note.md' },
]

const githubProject = { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }
type CommitCallback = (request: CommitRequest) => Promise<void>

function createGithubResponse(payload: unknown) {
    return {
        json: async () => payload,
        ok: true,
        status: 200,
    } as Response
}

function createGithubRawResponse(content: string) {
    return {
        ok: true,
        status: 200,
        text: async () => content,
    } as Response
}

function createGithubStatusResponse(status: number) {
    return {
        json: async () => ({}),
        ok: status >= 200 && status < 300,
        status,
    } as Response
}

function conversation(path = '.md2-agent-logs/one.json'): AgentConversation {
    return {
        cardPath: 'design/F-1-root.md',
        completedAt: '2026-01-01T00:01:00.000Z',
        continuedFrom: null,
        events: [],
        id: 'agent-1',
        messages: [{ content: 'done', id: 'm1', role: 'agent', timestamp: '2026-01-01T00:01:00.000Z' }],
        nativeSessionId: null,
        path,
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Agent run',
    }
}

function activeCardFile(id: string, options: { after?: string; sha?: string; status?: string } = {}): MarkdownFile {
    const content = [
        '---',
        `id: ${id.toUpperCase()}`,
        `internalId: ${id}`,
        `title: ${id.toUpperCase()}`,
        `status: ${options.status ?? 'todo'}`,
        ...(options.after ? [`after: ${options.after}`] : []),
        '---',
        '',
        `# ${id.toUpperCase()}`,
    ].join('\n')

    return { content, path: `design/${id.toUpperCase()}.md`, sha: options.sha }
}

function createDeferred<T>() {
    let resolveDeferred: (value: T) => void = () => undefined
    const promise = new Promise<T>((resolve) => {
        resolveDeferred = resolve
    })

    return { promise, resolve: resolveDeferred }
}

function createStorage(overrides: Partial<StorageService> = {}): StorageService {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositories: vi.fn(async () => []),
        listRepositoryFiles: vi.fn(async () => ['app/src/app.tsx', 'app/src/card.tsx', 'design/F-1-root.md']),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadAgentConversation: vi.fn(async (_project, path) => conversation(path)),
        loadProject: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        moveFiles: vi.fn(),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
        ...overrides,
    }
}

describe('cardNaming', () => {
    it('uses the next available number across folders and archived history cards', () => {
        expect(getNextCardNumber(files, 'F')).toBe(4)
    })

    it('creates cards with configured id and filename convention', () => {
        const file = createCardFile(files, 'design', DEFAULT_CARD_TYPES, DEFAULT_CARD_BODY_TEMPLATE, {
            body: 'Body',
            title: 'New Card',
            type: 'feature',
        })

        expect(file.path).toBe('design/F-4-new-card.md')
        expect(file.content).toContain('id: F-4')
        expect(file.content).toContain(DEFAULT_CARD_BODY_TEMPLATE)
        expect(file.content).toContain('Body')
        expect(file.content).toContain('policy:')
        expect(file.content).toContain('author:')
    })

    it('generates the id prefix and number per card type', () => {
        const job = createCardFile(files, 'design', DEFAULT_CARD_TYPES, DEFAULT_CARD_BODY_TEMPLATE, {
            body: '',
            title: 'Job Card',
            type: 'job',
        })
        const bug = createCardFile(files, 'design', DEFAULT_CARD_TYPES, DEFAULT_CARD_BODY_TEMPLATE, {
            body: '',
            title: 'Bug Card',
            type: 'bug',
        })

        expect(job.path).toBe('design/J-1-job-card.md')
        expect(job.content).toContain('id: J-1')
        expect(bug.path).toBe('design/B-1-bug-card.md')
        expect(bug.content).toContain('id: B-1')
    })

    it('numbers each type independently of other prefixes', () => {
        const nextFiles = [...files, { content: '# Job', path: 'design/J-7-job.md' }]

        expect(getNextCardNumber(nextFiles, 'J')).toBe(8)
        expect(getNextCardNumber(nextFiles, 'F')).toBe(4)
    })

    it('creates cards for custom configured types', () => {
        const customTypes = [{ color: '#123456', idPrefix: 'T', label: 'Task', type: 'task' }]
        const file = createCardFile(files, 'design', customTypes, DEFAULT_CARD_BODY_TEMPLATE, {
            body: '',
            title: 'Custom Card',
            type: 'task',
        })

        expect(file.path).toBe('design/T-1-custom-card.md')
        expect(file.content).toContain('id: T-1')
    })

    it('creates cards with a generated internal id that is separate from filename id', () => {
        const file = createCardFile(files, 'design', DEFAULT_CARD_TYPES, DEFAULT_CARD_BODY_TEMPLATE, {
            body: '',
            title: 'New Card',
            type: 'feature',
        })
        const card = markdownParsingService.parseCard(file, 'design')

        expect(card.header.id).toBe('F-4')
        expect(card.header.internalId).toBeTruthy()
        expect(card.header.internalId).not.toBe('F-4')
        expect(card.header.internalId).not.toContain('new-card')
    })
})

describe('CommitBatcher', () => {
    it('batches typing commits until the delay expires', async () => {
        vi.useFakeTimers()
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = new CommitBatcher({ clearDelay: window.clearTimeout, commit, delayMs: 30000, setDelay: window.setTimeout })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update root')
        batcher.schedule('main', [{ content: 'two', path: 'design/F-1-root.md' }], 'Update root')

        expect(commit).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(30000)

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({ files: [{ content: 'two', path: 'design/F-1-root.md' }], message: 'Update root' })
        vi.useRealTimers()
    })

    it('flushes one logical change with the exact message on close', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = new CommitBatcher({ clearDelay: window.clearTimeout, commit, delayMs: 30000, setDelay: window.setTimeout })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update root')
        expect(batcher.hasPending()).toBe(true)

        await batcher.flush()

        expect(batcher.hasPending()).toBe(false)
        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({ message: 'Update root' })
    })

    it('combines distinct messages for a multi-file batch', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = new CommitBatcher({ clearDelay: window.clearTimeout, commit, delayMs: 30000, setDelay: window.setTimeout })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update design/F-1-root.md')
        batcher.schedule('main', [{ content: 'two', path: 'design/F-2-child.md' }], 'Update design/F-2-child.md')
        await batcher.flush()

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({
            files: [
                { content: 'one', path: 'design/F-1-root.md' },
                { content: 'two', path: 'design/F-2-child.md' },
            ],
            message: 'Update 2 files\n\n- Update design/F-1-root.md\n- Update design/F-2-child.md',
        })
    })

    it('deduplicates repeated messages for the same path', async () => {
        const commit = vi.fn<CommitCallback>(async () => undefined)
        const batcher = new CommitBatcher({ clearDelay: window.clearTimeout, commit, delayMs: 30000, setDelay: window.setTimeout })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update design/F-1-root.md')
        batcher.schedule('main', [{ content: 'two', path: 'design/F-1-root.md' }], 'Update design/F-1-root.md')
        batcher.schedule('main', [{ content: 'three', path: 'design/F-2-child.md' }], 'Update design/F-2-child.md')
        await batcher.flush()

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({
            files: [
                { content: 'two', path: 'design/F-1-root.md' },
                { content: 'three', path: 'design/F-2-child.md' },
            ],
            message: 'Update 2 files\n\n- Update design/F-1-root.md\n- Update design/F-2-child.md',
        })
    })
})

describe('DataService', () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.mocked(actionRunner.run).mockClear()
        delete window.md2Actions
        configService.clear()
    })

    it('creates cards with commits and auto-pushes when configured', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.createCard({ body: 'Body', title: 'New Card', type: 'feature' })

        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({ message: 'Create design/F-4-new-card.md' }) as CommitRequest)
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
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

        await expect(service.openProject(githubProject)).rejects.toBeInstanceOf(GithubUnauthorizedError)
        expect(handleUnauthorized).toHaveBeenCalledTimes(1)
    })

    it('handles GitHub unauthorized once when a batched commit gets a 401', async () => {
        configService.init()
        const handleUnauthorized = vi.fn()
        const fetchImplementation = vi.fn(async (url: string, init: RequestInit = {}) => {
            if (url.includes('/contents/md2.config.json')) return createGithubStatusResponse(404)
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

        await service.openProject(githubProject)
        service.updateCardBody('design/F-1-root.md', '# Root\n\nChanged')

        await expect(service.flushPendingCommits()).rejects.toBeInstanceOf(GithubUnauthorizedError)
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
        await service.openProject({ branch: 'main', id: 'project' })

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
        await service.openProject({ branch: 'main', id: 'project' })

        await expect(service.importRemarkableImages({
            paths: ['/img/note.png'],
            settings: { host: 'remarkable.local', imageFolder: '/img', password: 'secret', port: 22, username: 'root' },
            target: { cardPath: 'design/F-1-root.md', kind: 'existing' },
        })).rejects.toThrow(/Electron local mode/u)

        expect(storage.commit).not.toHaveBeenCalled()
    })

    it('emits usage events after project and card operations succeed', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        service.init({ storage })
        await service.createProject({ branch: 'main', id: 'project' })
        await service.createCard({ body: 'Body', title: 'New Card', type: 'feature' })

        expect(trackEvent).toHaveBeenCalledWith('create_project')
        expect(trackEvent).toHaveBeenCalledWith('open_project')
        expect(trackEvent).toHaveBeenCalledWith('create_card')

        trackEvent.mockRestore()
    })

    it('does not emit create card usage when persistence fails', async () => {
        configService.init()
        const storage = createStorage({
            commit: vi.fn(async () => {
                throw new Error('commit failed')
            }),
        })
        const service = new DataService()
        const trackEvent = vi.spyOn(telemetryService, 'trackEvent').mockImplementation(() => undefined)

        service.init({ storage })
        await service.openProject({ branch: 'main', id: 'project' })
        trackEvent.mockClear()

        await expect(service.createCard({ body: 'Body', title: 'New Card', type: 'feature' })).rejects.toThrow('commit failed')
        expect(trackEvent).not.toHaveBeenCalledWith('create_card')

        trackEvent.mockRestore()
    })

    it('leaves commits unpushed in manual mode', async () => {
        configService.init()
        const storage = createStorage({ loadProjectConfig: vi.fn(async () => ({ pushMode: 'manual' as const })) })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.createCard({ body: 'Body', title: 'New Card', type: 'feature' })

        expect(storage.commit).toHaveBeenCalledTimes(1)
        expect(storage.push).not.toHaveBeenCalled()
    })

    it('completes a release by moving active cards to history and refreshing the snapshot', async () => {
        configService.init()
        const archivedFiles: MarkdownFile[] = [
            { content: files[0].content, path: 'design/history/v1/F-1-root.md' },
            { content: '# Old', path: 'design/history/F-3-old.md' },
            { content: '# Imported', path: 'design/history/v1/free note.md' },
        ]
        const storage = createStorage({
            listRepositoryFiles: vi.fn()
                .mockResolvedValueOnce(['design/F-1-root.md'])
                .mockResolvedValueOnce(['design/history/v1/F-1-root.md']),
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        const snapshot = await service.completeRelease('v1')

        expect(storage.moveFiles).toHaveBeenCalledWith({
            branch: 'main',
            message: 'Complete release v1',
            moves: [
                {
                    content: files[0].content,
                    fromPath: 'design/F-1-root.md',
                    sha: undefined,
                    toPath: 'design/history/v1/F-1-root.md',
                },
                {
                    content: '# Imported',
                    fromPath: 'design/free note.md',
                    sha: undefined,
                    toPath: 'design/history/v1/free note.md',
                },
            ],
        })
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
        if (!snapshot) throw new Error('Expected release completion to return a snapshot')

        expect(snapshot.activeCards).toHaveLength(0)
        expect(snapshot.backgroundCards.map((card) => card.path)).toContain('design/history/v1/F-1-root.md')
    })

    it('rejects invalid release names before moving files', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })

        await expect(service.completeRelease('bad/name')).rejects.toThrow('Release name may contain only')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('rejects duplicate release folders before moving files', async () => {
        configService.init()
        const storage = createStorage({
            loadProject: vi.fn(async () => ({
                files: [...files, { content: '# Archived', path: 'design/history/v1/F-9.md' }],
                workingFolder: 'design',
            })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })

        await expect(service.completeRelease('v1')).rejects.toThrow('Release already exists: v1')
        expect(storage.moveFiles).not.toHaveBeenCalled()
    })

    it('leaves release completion unpushed in manual mode', async () => {
        configService.init()
        const archivedFiles: MarkdownFile[] = [{ content: files[0].content, path: 'design/history/v1/F-1-root.md' }]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: archivedFiles, workingFolder: 'design' }),
            loadProjectConfig: vi.fn(async () => ({ pushMode: 'manual' as const })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.completeRelease('v1')

        expect(storage.moveFiles).toHaveBeenCalledTimes(1)
        expect(storage.push).not.toHaveBeenCalled()
    })

    it('toggles a card policy flag and persists the change', async () => {
        configService.init()
        const policyFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ntitle: Root\nstatus: active\npolicy:\n  checkLinting: true\n---\n\n# Root', path: 'design/F-1-root.md' },
        ]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: policyFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: policyFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        service.toggleCardPolicy('design/F-1-root.md', 'checkLinting')
        await service.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toContain('checkLinting: false')
    })

    it('moves a card across columns writing only the affected cards', async () => {
        configService.init()
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: A\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/A.md' },
            { content: '---\nid: B\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B', path: 'design/B.md' },
            { content: '---\nid: P\ninternalId: p\ntitle: P\nstatus: done\n---\n\n# P', path: 'design/P.md' },
        ]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        const updates = service.moveCard('design/B.md', 'done', 1)
        await service.flushPendingCommits()

        expect(updates).toContainEqual({ after: 'p', path: 'design/B.md', status: 'done' })
        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        const committedPaths = committed.files.map((file) => file.path)
        expect(committedPaths).toEqual(['design/B.md'])
        const movedContent = committed.files[0].content
        expect(movedContent).toContain('status: done')
        expect(movedContent).toContain('after: p')
    })

    it('repairs ordering after deleting a middle card', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
            activeCardFile('c', { after: 'b', sha: 'sha-c' }),
        ]
        const refreshedFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('c', { after: 'a', sha: 'sha-c-next' }),
        ]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: deletionFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: refreshedFiles, workingFolder: 'design' }),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        const snapshot = await service.deleteCard('design/B.md')

        const repairCommit = vi.mocked(storage.commit).mock.calls[0][0]
        expect(repairCommit).toMatchObject({ branch: 'main', message: 'Repair ordering after deleting design/B.md' })
        expect(repairCommit.files.map((file) => file.path)).toEqual(['design/C.md'])
        expect(repairCommit.files[0].content).toContain('after: a')
        expect(storage.deleteFile).toHaveBeenCalledWith({
            branch: 'main',
            message: 'Delete design/B.md',
            path: 'design/B.md',
            sha: 'sha-b',
        })
        expect(vi.mocked(storage.commit).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(storage.deleteFile).mock.invocationCallOrder[0],
        )
        expect(snapshot?.activeCards.map((card) => card.path)).toEqual(['design/A.md', 'design/C.md'])
    })

    it('does not repair ordering after deleting a tail card', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
        ]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: deletionFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: [deletionFiles[0]], workingFolder: 'design' }),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.deleteCard('design/B.md')

        expect(storage.commit).not.toHaveBeenCalled()
        expect(storage.deleteFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'design/B.md', sha: 'sha-b' }))
    })

    it('leaves deleted files unpushed in manual mode', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
        ]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: deletionFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: [deletionFiles[0]], workingFolder: 'design' }),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
            loadProjectConfig: vi.fn(async () => ({ pushMode: 'manual' as const })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.deleteCard('design/B.md')

        expect(storage.deleteFile).toHaveBeenCalledTimes(1)
        expect(storage.push).not.toHaveBeenCalled()
    })

    it('leaves the snapshot unchanged when storage delete fails', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
        ]
        const storage = createStorage({
            deleteFile: vi.fn(async () => {
                throw new Error('delete failed')
            }),
            loadProject: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        const beforePaths = service.getState().snapshot?.activeCards.map((card) => card.path)

        await expect(service.deleteCard('design/B.md')).rejects.toThrow('delete failed')

        expect(service.getState().snapshot?.activeCards.map((card) => card.path)).toEqual(beforePaths)
        expect(storage.push).not.toHaveBeenCalled()
        expect(storage.loadProject).toHaveBeenCalledTimes(1)
    })

    it('flushes a pending body update before deleting a card', async () => {
        configService.init()
        const deletionFiles = [
            activeCardFile('a', { sha: 'sha-a' }),
            activeCardFile('b', { after: 'a', sha: 'sha-b' }),
        ]
        const storage = createStorage({
            loadProject: vi.fn()
                .mockResolvedValueOnce({ files: deletionFiles, workingFolder: 'design' })
                .mockResolvedValueOnce({ files: [deletionFiles[0]], workingFolder: 'design' }),
            loadProjectRoot: vi.fn(async () => ({ files: deletionFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        service.updateCardBody('design/B.md', '# B\n\nEdited body')
        await service.deleteCard('design/B.md')

        const updateCommit = vi.mocked(storage.commit).mock.calls[0][0]
        expect(updateCommit.files[0].path).toBe('design/B.md')
        expect(updateCommit.files[0].content).toContain('Edited body')
        expect(vi.mocked(storage.commit).mock.invocationCallOrder[0]).toBeLessThan(
            vi.mocked(storage.deleteFile).mock.invocationCallOrder[0],
        )
    })

    it('runs matching onState actions when a card changes to the configured state', async () => {
        configService.init()
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/F-1.md' },
            { content: '---\nid: F-2\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B', path: 'design/F-2.md' },
        ]
        const actionFile = {
            content: JSON.stringify({
                appliesTo: { type: 'feature' },
                description: 'Ready',
                label: 'Ready',
                name: 'ready-action',
                onState: 'ready',
                text: 'run',
                type: 'cmd',
            }),
            path: 'actions/ready.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        service.moveCard('design/F-2.md', 'ready', 0)

        expect(actionRunner.run).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'ready-action' }),
            expect.objectContaining({ file: 'design/F-2.md', kind: 'card', state: 'ready', type: 'feature' }),
        )
    })

    it('surfaces failed onState actions on the moved card', async () => {
        configService.init()
        vi.mocked(actionRunner.run).mockResolvedValueOnce({
            logs: [{
                actionName: 'ready-action',
                command: 'run',
                message: 'Ready failed with exit code 1',
                phase: 'main',
                status: 'failed',
                stderr: 'bad',
                stdout: '',
            }],
            status: 'failed',
        })
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/F-1.md' },
            { content: '---\nid: F-2\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B', path: 'design/F-2.md' },
        ]
        const actionFile = {
            content: JSON.stringify({
                appliesTo: { type: 'feature' },
                description: 'Ready',
                label: 'Ready',
                name: 'ready-action',
                onState: 'ready',
                text: 'run',
                type: 'cmd',
            }),
            path: 'actions/ready.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        service.moveCard('design/F-2.md', 'ready', 0)

        await vi.waitFor(() => {
            const movedCard = service.getState().snapshot?.activeCards.find((card) => card.path === 'design/F-2.md')
            expect(movedCard?.agentConversationErrors).toEqual([
                { message: 'Ready failed with exit code 1', path: 'onState:ready-action' },
            ])
        })
    })

    it('does not run onState actions when a card is reordered inside the same state', async () => {
        configService.init()
        const moveFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ninternalId: a\ntitle: A\nstatus: todo\n---\n\n# A', path: 'design/F-1.md' },
            { content: '---\nid: F-2\ninternalId: b\ntitle: B\nstatus: todo\nafter: a\n---\n\n# B', path: 'design/F-2.md' },
        ]
        const actionFile = {
            content: JSON.stringify({
                description: 'Todo',
                label: 'Todo',
                name: 'todo-action',
                onState: 'todo',
                text: 'run',
                type: 'cmd',
            }),
            path: 'actions/todo.json',
        }
        const storage = createStorage({
            loadActionFiles: vi.fn(async () => [actionFile]),
            loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        service.moveCard('design/F-2.md', 'todo', 0)

        expect(actionRunner.run).not.toHaveBeenCalled()
    })

    it('edits a card title inline and persists it through the header', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        service.updateCardTitle('design/F-1-root.md', 'Renamed Root')
        await service.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toContain('title: Renamed Root')
    })

    it('edits a header field while preserving unknown header fields unchanged', async () => {
        configService.init()
        const headerFiles: MarkdownFile[] = [{
            content: '---\ncustomField: keep me\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root',
            path: 'design/F-1-root.md',
        }]
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: headerFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: headerFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        service.updateCardHeaderFields('design/F-1-root.md', { status: 'ready' })
        await service.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toBe('---\ncustomField: keep me\nid: F-1\ntitle: Root\nstatus: ready\n---\n\n# Root')
    })

    it('preserves the frontmatter header when a card body is edited', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        service.updateCardBody('design/F-1-root.md', '\n# Root\n\nEdited body')
        await service.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content.startsWith('---\nid: F-1')).toBe(true)
        expect(committed.files[0].content).toContain('Edited body')
    })

    it('uses the committed sha from the first body update for the next body update', async () => {
        configService.init()
        const staleShaFiles: MarkdownFile[] = [{
            content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root',
            path: 'design/F-1-root.md',
            sha: 'sha-1',
        }]
        const commit = vi.fn(async (request: CommitRequest) => {
            const [file] = request.files
            if (!file) throw new Error('Expected commit file')

            return [{ ...file, sha: 'sha-2' }]
        })
        const storage = createStorage({
            commit,
            loadProject: vi.fn(async () => ({ files: staleShaFiles, workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: staleShaFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        service.updateCardBody('design/F-1-root.md', '# Root\n\nFirst edit')
        await service.flushPendingCommits()

        const snapshotCard = service.getState().snapshot?.activeCards[0]
        expect(snapshotCard?.sha).toBe('sha-2')

        service.updateCardBody('design/F-1-root.md', '# Root\n\nSecond edit')
        await service.flushPendingCommits()

        expect(commit).toHaveBeenCalledTimes(2)
        expect(commit.mock.calls[1][0].files[0].sha).toBe('sha-2')
    })

    it('updates card affects through the shared header rewrite and save flow', async () => {
        configService.init()
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        service.updateCardAffects('design/F-1-root.md', ['app/src/card.tsx'])
        await service.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toContain('affects:\n  - app/src/card.tsx')
        expect(committed.files[0].content).not.toContain('app/src/app.tsx')
        expect(committed.files[0].content.endsWith('\n\n# Root')).toBe(true)
    })

    it('loads action files from the configured actions folder into the action service on open', async () => {
        configService.init()
        const actionFile = { content: JSON.stringify({ description: 'Do', label: 'Do', name: 'do', text: 'run', type: 'cmd' }), path: 'actions/do.json' }
        const storage = createStorage({ loadActionFiles: vi.fn(async () => [actionFile]) })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })

        expect(storage.loadActionFiles).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'actions')
        expect(actionService.getActions().map((action) => action.name)).toContain('do')
    })

    it('dispatches the root snapshot before loading background subfolder and history cards', async () => {
        configService.init()
        const rootFiles = [files[0]]
        const backgroundFile = files[1]
        const fullProject = createDeferred<StorageProjectFiles>()
        const snapshots: Array<ReturnType<DataService['getState']>['snapshot']> = []
        const storage = createStorage({
            listRepositoryFiles: vi.fn(async () => ['design/F-1-root.md', 'design/history/F-3-old.md']),
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: rootFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })
        service.addEventListener('changed', () => {
            snapshots.push(service.getState().snapshot)
        })

        const openedSnapshot = await service.openProject({ branch: 'main', id: 'project' })

        expect(openedSnapshot.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md'])
        expect(openedSnapshot.backgroundCards).toHaveLength(0)
        expect(snapshots.filter((snapshot) => snapshot !== null)[0]?.backgroundCards).toHaveLength(0)
        expect(storage.loadProjectRoot).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'design')
        expect(storage.loadProject).toHaveBeenCalledWith({ branch: 'main', id: 'project' }, 'design')

        fullProject.resolve({ files: [files[0], backgroundFile], workingFolder: 'design' })

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.backgroundCards.map((card) => card.path)).toEqual(['design/history/F-3-old.md'])
        })
    })

    it('loads referenced agent conversations onto cards', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ntitle: Root\nstatus: active\nagents:\n  - .md2-agent-logs/one.json\n---\n\n# Root',
                path: 'design/F-1-root.md',
            },
        ]
        const conversationLoad = createDeferred<AgentConversation>()
        const fullProject = createDeferred<StorageProjectFiles>()
        const storage = createStorage({
            loadAgentConversation: vi.fn(async () => conversationLoad.promise),
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        const snapshot = await service.openProject({ branch: 'main', id: 'project' })

        expect(snapshot.activeCards[0].agentConversations).toHaveLength(0)
        conversationLoad.resolve(conversation())

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversations[0].title).toBe('Agent run')
        })
    })

    it('keeps cards loaded when a referenced agent log is invalid', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ntitle: Root\nstatus: active\nagents:\n  - .md2-agent-logs/missing.json\n---\n\n# Root',
                path: 'design/F-1-root.md',
            },
        ]
        const fullProject = createDeferred<StorageProjectFiles>()
        const storage = createStorage({
            loadAgentConversation: vi.fn(async () => {
                throw new Error('Agent log not found')
            }),
            loadProject: vi.fn(async () => fullProject.promise),
            loadProjectRoot: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        const snapshot = await service.openProject({ branch: 'main', id: 'project' })

        expect(snapshot.activeCards[0].header.title).toBe('Root')
        expect(snapshot.activeCards[0].agentConversationErrors).toEqual([])

        await vi.waitFor(() => {
            expect(service.getState().snapshot?.activeCards[0].agentConversationErrors).toEqual([
                { message: 'Agent log not found', path: '.md2-agent-logs/missing.json' },
            ])
        })
    })

    it('continues a conversation and links the returned streaming log to the card header', async () => {
        configService.init()
        const continuedConversation = { ...conversation('.md2-agent-logs/two.json'), id: 'agent-2', status: 'running' as const }
        const storage = createStorage({
            startAgentConversation: vi.fn(async () => ({
                conversation: continuedConversation,
                reference: '.md2-agent-logs/two.json',
                runId: 'agent-2',
            })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.continueAgentConversation('design/F-1-root.md', '.md2-agent-logs/one.json')
        await service.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toContain('agents:\n  - .md2-agent-logs/two.json')
        expect(storage.startAgentConversation).toHaveBeenCalledWith(
            { branch: 'main', id: 'project' },
            {
                cardPath: 'design/F-1-root.md',
                continuedFrom: '.md2-agent-logs/one.json',
                nativeResumeSessionId: undefined,
                prompt: expect.stringContaining('agent: done'),
                title: 'Continue',
            },
            expect.any(Function),
        )
    })

    it('uses native resume when the source conversation has a native session id', async () => {
        configService.init()
        const sourceConversation = { ...conversation('.md2-agent-logs/one.json'), nativeSessionId: 'session-1' }
        const storage = createStorage({
            loadAgentConversation: vi.fn(async () => sourceConversation),
            startAgentConversation: vi.fn(async () => ({
                conversation: { ...conversation('.md2-agent-logs/two.json'), continuedFrom: '.md2-agent-logs/one.json', id: 'agent-2' },
                reference: '.md2-agent-logs/two.json',
                runId: 'agent-2',
            })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.continueAgentConversation('design/F-1-root.md', '.md2-agent-logs/one.json')

        expect(storage.startAgentConversation).toHaveBeenCalledWith(
            { branch: 'main', id: 'project' },
            {
                cardPath: 'design/F-1-root.md',
                continuedFrom: '.md2-agent-logs/one.json',
                nativeResumeSessionId: 'session-1',
                prompt: 'continue',
                title: 'Continue',
            },
            expect.any(Function),
        )
    })

    it('reports running agent state from streaming continue events', async () => {
        configService.init()
        const callbacks: Array<(event: AgentRunEvent) => void> = []
        const storage = createStorage({
            startAgentConversation: vi.fn(async (_project, _request, callback) => {
                callbacks.push(callback)
                const runningConversation: AgentConversation = { ...conversation('.md2-agent-logs/two.json'), id: 'agent-2', status: 'running' }

                return { conversation: runningConversation, reference: '.md2-agent-logs/two.json', runId: 'agent-2' }
            }),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.continueAgentConversation('design/F-1-root.md', '.md2-agent-logs/one.json')
        if (!callbacks[0]) throw new Error('Streaming callback not registered')

        callbacks[0]({ content: '', conversation: { ...conversation(), id: 'agent-2', status: 'running' }, runId: 'agent-2', type: 'started' })
        expect(service.getState().runningAgents).toHaveLength(1)

        callbacks[0]({ content: '0', conversation: { ...conversation(), id: 'agent-2', status: 'completed' }, runId: 'agent-2', type: 'closed' })

        expect(service.getState().runningAgents).toHaveLength(0)
    })

    it('reports desktop-owned scheduled action runs in running agent state', async () => {
        configService.init()
        let scheduledRunCallback: ((event: AgentRunEvent) => void) | null = null
        window.md2Actions = {
            onScheduledActionRun: (callback: (event: AgentRunEvent) => void) => {
                scheduledRunCallback = callback

                return vi.fn()
            },
        } as unknown as typeof window.md2Actions
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        if (!scheduledRunCallback) throw new Error('Scheduled run callback not registered')
        const emitScheduledRun = scheduledRunCallback as (event: AgentRunEvent) => void

        const runningConversation: AgentConversation = { ...conversation(), id: 'schedule-1', status: 'running', title: 'Scheduled implement' }
        emitScheduledRun({ content: '', conversation: runningConversation, runId: 'schedule-1', type: 'started' })
        expect(service.getState().runningAgents).toEqual([{ id: 'schedule-1', label: 'Scheduled implement' }])

        emitScheduledRun({
            content: '',
            conversation: { ...runningConversation, completedAt: '2026-01-01T00:02:00.000Z', status: 'completed' },
            runId: 'schedule-1',
            type: 'closed',
        })

        expect(service.getState().runningAgents).toHaveLength(0)
    })

    it('reloads actions when the local actions folder watcher reports json changes', async () => {
        vi.useFakeTimers()
        configService.init()
        const actionFile = { content: JSON.stringify({ description: 'Do', label: 'Do', name: 'do', text: 'run', type: 'cmd' }), path: 'actions/do.json' }
        const loadActionFiles = vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([actionFile])
            .mockResolvedValueOnce([])
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadActionFiles,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'actions/do.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.name)).toContain('do')

        watchChange({ changeKind: 'changed', path: 'actions/do.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.name)).not.toContain('do')
    })

    it('surfaces action reload validation errors without dropping the previous valid actions', async () => {
        vi.useFakeTimers()
        configService.init()
        const validActionFile = { content: JSON.stringify({ description: 'Do', label: 'Do', name: 'do', text: 'run', type: 'cmd' }), path: 'actions/do.json' }
        const invalidActionFile = { content: JSON.stringify({ description: 'Bad', label: 'Bad', name: 'bad', text: 'run', type: 'bad' }), path: 'actions/bad.json' }
        const loadActionFiles = vi.fn()
            .mockResolvedValueOnce([validActionFile])
            .mockResolvedValueOnce([invalidActionFile])
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadActionFiles,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'actions/bad.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.name)).toContain('do')
        expect(actionService.getState().error).toContain('actions/bad.json')
        expect(actionService.getState().error).toContain('Invalid action type')
    })

    it('adds a markdown card when the watcher reports a new file', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => ({ content: '# New external note', path: 'design/free-note.md' })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'added', path: 'design/free-note.md' })
        await vi.advanceTimersByTimeAsync(150)

        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/free-note.md')
        expect(card?.header.status).toBe('new')
    })

    it('updates markdown content when the watcher reports an external edit', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => ({
                content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root\n\nExternally changed',
                path: 'design/F-1-root.md',
            })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
        expect(card?.content).toContain('Externally changed')
    })

    it('removes a markdown card when the watcher reports deletion', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'removed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        expect(service.getState().snapshot?.activeCards.some((card) => card.path === 'design/F-1-root.md')).toBe(false)
        expect(storage.loadFile).not.toHaveBeenCalled()
    })

    it('debounces repeated markdown watcher events for the same file', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const loadFile = vi.fn(async () => ({
            content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root\n\nLatest',
            path: 'design/F-1-root.md',
        }))
        const storage = createStorage({
            loadFile,
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.openProject({ branch: 'main', id: 'project' })

        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(149)
        expect(loadFile).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)

        expect(loadFile).toHaveBeenCalledTimes(1)
    })

    it('ignores self-echo markdown watcher events when content matches memory', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => files[0]),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        await service.openProject({ branch: 'main', id: 'project' })
        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
        expect(card?.content).toContain('# Root')
    })

    it('reports a conflict and keeps local markdown content when unsaved edits exist', async () => {
        vi.useFakeTimers()
        configService.init()
        let watchChange: (event: { changeKind: 'added' | 'changed' | 'removed' | 'unknown'; path: string }) => void = () => {
            throw new Error('Watcher not registered')
        }
        const storage = createStorage({
            loadFile: vi.fn(async () => ({
                content: '---\nid: F-1\ntitle: Root\nstatus: active\n---\n\n# Root\n\nExternal',
                path: 'design/F-1-root.md',
            })),
            watchProject: vi.fn((_project, onChange) => {
                watchChange = onChange

                return vi.fn()
            }),
        })
        const service = new DataService()
        service.init({ storage })
        const conflicts: string[] = []
        window.addEventListener('md2:workspace-error', (event) => {
            conflicts.push((event as CustomEvent<string>).detail)
        })
        await service.openProject({ branch: 'main', id: 'project' })

        service.updateCardBody('design/F-1-root.md', '# Root\n\nLocal draft')
        watchChange({ changeKind: 'changed', path: 'design/F-1-root.md' })
        await vi.advanceTimersByTimeAsync(150)

        expect(conflicts[0]).toContain('External change ignored for design/F-1-root.md')
        const card = service.getState().snapshot?.activeCards.find((candidate) => candidate.path === 'design/F-1-root.md')
        expect(card?.content).toContain('Local draft')
    })
})
