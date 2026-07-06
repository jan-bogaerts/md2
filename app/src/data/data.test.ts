import { describe, expect, it, vi } from 'vitest'
import { CommitBatcher } from './commit_batcher'
import { afterEach } from 'vitest'
import { createCardFile, getNextCardNumber } from './card_naming'
import { actionService } from '../services/action_service'
import { actionRunner } from '../services/action_runner'
import { configService } from '../services/config_service'
import { DataService } from '../services/data_service'
import { markdownParsingService } from '../services/markdown_parsing_service'
import { telemetryService } from '../services/telemetry_service'
import {
    DEFAULT_CARD_BODY_TEMPLATE,
    DEFAULT_CARD_TYPES,
    type AgentConversation,
    type CommitRequest,
    type ContinueAgentConversationResult,
    type MarkdownFile,
    type StorageService,
} from './data_types'

vi.mock('../services/action_runner', () => ({ actionRunner: { run: vi.fn(async () => ({ logs: [], status: 'completed' })) } }))

const files: MarkdownFile[] = [
    { content: '---\nid: F-1\ntitle: Root\nstatus: active\naffects:\n  - app/src/app.tsx\n---\n\n# Root', path: 'design/F-1-root.md' },
    { content: '# Old', path: 'design/history/F-3-old.md' },
    { content: '# Imported', path: 'design/free note.md' },
]

function conversation(path = '.md2-agent-logs/one.json'): AgentConversation {
    return {
        cardPath: 'design/F-1-root.md',
        completedAt: '2026-01-01T00:01:00.000Z',
        events: [],
        id: 'agent-1',
        messages: [{ content: 'done', id: 'm1', role: 'agent', timestamp: '2026-01-01T00:01:00.000Z' }],
        path,
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Agent run',
    }
}

function createStorage(overrides: Partial<StorageService> = {}): StorageService {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(),
        createProject: vi.fn(async (project) => project),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        loadActionFiles: vi.fn(async () => []),
        loadProject: vi.fn(async () => ({ files, workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => null),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
        ...overrides,
    }
}

describe('cardNaming', () => {
    it('uses the next available number across folders and subfolders', () => {
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
        const commit = vi.fn()
        const batcher = new CommitBatcher({ clearDelay: window.clearTimeout, commit, delayMs: 30000, setDelay: window.setTimeout })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update root')
        batcher.schedule('main', [{ content: 'two', path: 'design/F-1-root.md' }], 'Update root')

        expect(commit).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(30000)

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit.mock.calls[0][0]).toMatchObject({ files: [{ content: 'two', path: 'design/F-1-root.md' }] })
        vi.useRealTimers()
    })

    it('flushes pending commits on close', async () => {
        const commit = vi.fn()
        const batcher = new CommitBatcher({ clearDelay: window.clearTimeout, commit, delayMs: 30000, setDelay: window.setTimeout })

        batcher.schedule('main', [{ content: 'one', path: 'design/F-1-root.md' }], 'Update root')
        await batcher.flush()

        expect(commit).toHaveBeenCalledTimes(1)
    })
})

describe('DataService', () => {
    afterEach(() => {
        vi.useRealTimers()
        vi.mocked(actionRunner.run).mockClear()
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

    it('toggles a card policy flag and persists the change', async () => {
        configService.init()
        const policyFiles: MarkdownFile[] = [
            { content: '---\nid: F-1\ntitle: Root\nstatus: active\npolicy:\n  checkLinting: true\n---\n\n# Root', path: 'design/F-1-root.md' },
        ]
        const storage = createStorage({ loadProject: vi.fn(async () => ({ files: policyFiles, workingFolder: 'design' })) })
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
        const storage = createStorage({ loadProject: vi.fn(async () => ({ files: moveFiles, workingFolder: 'design' })) })
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

    it('loads referenced agent conversations onto cards', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ntitle: Root\nstatus: active\nagents:\n  - .md2-agent-logs/one.json\n---\n\n# Root',
                path: 'design/F-1-root.md',
            },
        ]
        const storage = createStorage({
            loadAgentConversation: vi.fn(async () => conversation()),
            loadProject: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        const snapshot = await service.openProject({ branch: 'main', id: 'project' })

        expect(snapshot.activeCards[0].agentConversations).toHaveLength(1)
        expect(snapshot.activeCards[0].agentConversations[0].title).toBe('Agent run')
    })

    it('keeps cards loaded when a referenced agent log is invalid', async () => {
        configService.init()
        const agentFiles: MarkdownFile[] = [
            {
                content: '---\nid: F-1\ntitle: Root\nstatus: active\nagents:\n  - .md2-agent-logs/missing.json\n---\n\n# Root',
                path: 'design/F-1-root.md',
            },
        ]
        const storage = createStorage({
            loadAgentConversation: vi.fn(async () => {
                throw new Error('Agent log not found')
            }),
            loadProject: vi.fn(async () => ({ files: agentFiles, workingFolder: 'design' })),
        })
        const service = new DataService()
        service.init({ storage })

        const snapshot = await service.openProject({ branch: 'main', id: 'project' })

        expect(snapshot.activeCards[0].header.title).toBe('Root')
        expect(snapshot.activeCards[0].agentConversationErrors).toEqual([
            { message: 'Agent log not found', path: '.md2-agent-logs/missing.json' },
        ])
    })

    it('continues a conversation and links the returned log to the card header', async () => {
        configService.init()
        const storage = createStorage({continueAgentConversation: vi.fn(async () => ({ conversation: conversation('.md2-agent-logs/two.json'), reference: '.md2-agent-logs/two.json' }))})
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.continueAgentConversation('design/F-1-root.md', '.md2-agent-logs/one.json')
        await service.flushPendingCommits()

        const committed = (storage.commit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as CommitRequest
        expect(committed.files[0].content).toContain('agents:\n  - .md2-agent-logs/two.json')
        expect(storage.continueAgentConversation).toHaveBeenCalledWith(
            { branch: 'main', id: 'project' },
            { cardPath: 'design/F-1-root.md', input: 'continue', sourcePath: '.md2-agent-logs/one.json' },
        )
    })

    it('reports running agent state while a continue request is in flight', async () => {
        configService.init()
        const resolveContinue: Array<(result: ContinueAgentConversationResult) => void> = []
        const storage = createStorage({
            continueAgentConversation: vi.fn(() => new Promise<ContinueAgentConversationResult>((resolve) => {
                resolveContinue.push(resolve)
            })),
        })
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        const pending = service.continueAgentConversation('design/F-1-root.md', '.md2-agent-logs/one.json')

        expect(service.getState().runningAgents).toHaveLength(1)

        if (!resolveContinue[0]) throw new Error('Continue resolver not registered')

        resolveContinue[0]({ conversation: conversation('.md2-agent-logs/two.json'), reference: '.md2-agent-logs/two.json' })
        await pending

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
        let watchChange: (event: { path: string }) => void = () => {
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
        watchChange({ path: 'actions/do.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.name)).toContain('do')

        watchChange({ path: 'actions/do.json' })
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
        let watchChange: (event: { path: string }) => void = () => {
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
        watchChange({ path: 'actions/bad.json' })
        await vi.advanceTimersByTimeAsync(150)

        expect(actionService.getActions().map((action) => action.name)).toContain('do')
        expect(actionService.getState().error).toContain('actions/bad.json')
        expect(actionService.getState().error).toContain('Invalid action type')
    })
})
