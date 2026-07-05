import { describe, expect, it, vi } from 'vitest'
import { CommitBatcher } from './commit_batcher'
import { afterEach } from 'vitest'
import { createCardFile, getNextCardNumber } from './card_naming'
import { configService } from '../services/config_service'
import { DataService } from '../services/data_service'
import { markdownParsingService } from '../services/markdown_parsing_service'
import { DEFAULT_CARD_BODY_TEMPLATE, DEFAULT_CARD_TYPES, type CommitRequest, type MarkdownFile, type StorageService } from './data_types'

const files: MarkdownFile[] = [
    { content: '---\nid: F-1\ntitle: Root\nstatus: active\naffects:\n  - app/src/app.tsx\n---\n\n# Root', path: 'design/F-1-root.md' },
    { content: '# Old', path: 'design/history/F-3-old.md' },
    { content: '# Imported', path: 'design/free note.md' },
]

function createStorage(overrides: Partial<StorageService> = {}): StorageService {
    return {
        checkoutBranch: vi.fn(async (project, branch) => ({ ...project, branch })),
        commit: vi.fn(),
        createProject: vi.fn(async (project) => project),
        listBranches: vi.fn(async () => [{ name: 'main' }]),
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

    it('leaves commits unpushed in manual mode', async () => {
        configService.init()
        const storage = createStorage({ loadProjectConfig: vi.fn(async () => ({ pushMode: 'manual' })) })
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
})
