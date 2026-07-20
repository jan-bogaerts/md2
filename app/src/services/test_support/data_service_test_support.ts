import { vi } from 'vitest'
import type {
    AgentConversation,
    CommitRequest,
    MarkdownFile,
    StorageService,
} from '../../data/data_types'
import { actionService } from '../actions/action_service'
import { DataService } from '../data/data_service'
import { projectPersistenceService } from '../project/project_persistence_service'

export function createDataService() {
    const service = new DataService()
    projectPersistenceService.init({ actionService, dataService: service })

    return service
}

export const files: MarkdownFile[] = [
    { content: '---\nid: F-1\ninternalId: root-card\ntitle: Root\nstatus: active\naffects:\n  - app/src/app.tsx\n---\n\n# Root', path: 'design/F-1-root.md' },
    { content: '---\ninternalId: old-card\n---\n\n# Old', path: 'design/history/F-3-old.md' },
    { content: '# Imported', path: 'design/free note.md' },
]
export const storageFiles = files.filter((file) => file.path !== 'design/free note.md')

export const githubProject = { branch: 'main', id: 'owner/repo', owner: 'owner', repository: 'repo' }

export function createGithubResponse(payload: unknown) {
    return {
        json: async () => payload,
        ok: true,
        status: 200,
    } as Response
}

export function createGithubRawResponse(content: string) {
    return {
        ok: true,
        status: 200,
        text: async () => content,
    } as Response
}

export function createGithubStatusResponse(status: number) {
    return {
        json: async () => ({}),
        ok: status >= 200 && status < 300,
        status,
    } as Response
}

export function conversation(path = '.md2-agent-logs/one.json'): AgentConversation {
    return {
        cardPath: 'design/F-1-root.md',
        completedAt: '2026-01-01T00:01:00.000Z',
        events: [],
        hasExplicitTitle: true,
        id: 'agent-1',
        messages: [{ content: 'done', id: 'm1', role: 'assistant', timestamp: '2026-01-01T00:01:00.000Z' }],
        path,
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Agent run',
    }
}

export function activeCardFile(id: string, options: { after?: string; sha?: string; status?: string } = {}): MarkdownFile {
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

    return { content, path: `design/${id.toUpperCase()}-1-${id}.md`, sha: options.sha }
}

export function createDeferred<T>() {
    let resolveDeferred: (value: T) => void = () => undefined
    let rejectDeferred: (reason?: unknown) => void = () => undefined
    const promise = new Promise<T>((resolve, reject) => {
        resolveDeferred = resolve
        rejectDeferred = reject
    })

    return { promise, reject: rejectDeferred, resolve: resolveDeferred }
}

export function waitForWorkerTurn() {
    return new Promise((resolve) => {
        window.setTimeout(resolve, 0)
    })
}

export function createStorage(overrides: Partial<StorageService> = {}): StorageService {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(async () => []),
        createProject: vi.fn(async (project) => project),
        createWorkingFolderFromTemplate: vi.fn(async (project) => project),
        deleteFile: vi.fn(),
        deleteFolder: vi.fn(),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
        listRepositories: vi.fn(async () => []),
        listRepositoryFiles: vi.fn(async () => ['app/src/app.tsx', 'app/src/card.tsx', 'design/F-1-root.md']),
        listTopLevelFolders: vi.fn(async () => [{ name: 'design', path: 'design' }]),
        loadActionFiles: vi.fn(async () => []),
        loadAgentConversation: vi.fn(async (_project, path) => conversation(path)),
        loadProject: vi.fn(async () => ({ files: storageFiles, workingFolder: 'design' })),
        loadProjectRoot: vi.fn(async () => ({ files: storageFiles, workingFolder: 'design' })),
        loadProjectConfig: vi.fn(async () => ({ backgroundShade: 'blue' as const, projectFolder: '', workingFolder: 'design' })),
        moveFiles: vi.fn(),
        push: vi.fn(),
        saveProjectConfig: vi.fn(),
        ...overrides,
    }
}

export type CommitCallback = (request: CommitRequest) => Promise<void>
