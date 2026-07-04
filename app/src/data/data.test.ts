import { describe, expect, it, vi } from 'vitest'
import { CommitBatcher } from './commit_batcher'
import { createCardFile, getNextCardNumber } from './card_naming'
import { DataService } from '../services/data_service'
import { DEFAULT_CARD_TYPES, type CommitRequest, type MarkdownFile, type StorageService } from './data_types'
import { followsCardNamingConvention, parseMarkdownCard, splitProjectCards } from './markdown_headers'

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
        push: vi.fn(),
        ...overrides,
    }
}

describe('markdownHeaders', () => {
    it('parses frontmatter and marks root files as active', () => {
        const card = parseMarkdownCard(files[0], 'design')

        expect(card.isActive).toBe(true)
        expect(card.header).toMatchObject({
            affects: ['app/src/app.tsx'],
            id: 'F-1',
            status: 'active',
            title: 'Root',
        })
    })

    it('imports external files without naming convention as new features', () => {
        const card = parseMarkdownCard(files[2], 'design')

        expect(followsCardNamingConvention(card.path)).toBe(false)
        expect(card.header.id).toBe('F-0')
        expect(card.header.status).toBe('new')
    })

    it('splits active root cards before background cards', () => {
        const cards = splitProjectCards(files, 'design')

        expect(cards.activeCards.map((card) => card.path)).toEqual(['design/F-1-root.md', 'design/free note.md'])
        expect(cards.backgroundCards.map((card) => card.path)).toEqual(['design/history/F-3-old.md'])
    })
})

describe('cardNaming', () => {
    it('uses the next available number across folders and subfolders', () => {
        expect(getNextCardNumber(files, 'F')).toBe(4)
    })

    it('creates cards with configured id and filename convention', () => {
        const file = createCardFile(files, 'design', DEFAULT_CARD_TYPES, { body: 'Body', title: 'New Card', type: 'feature' })

        expect(file.path).toBe('design/F-4-new-card.md')
        expect(file.content).toContain('id: F-4')
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
    it('creates cards with commits and auto-pushes when configured', async () => {
        const storage = createStorage()
        const service = new DataService()
        service.init({ storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.createCard({ body: 'Body', title: 'New Card', type: 'feature' })

        expect(storage.commit).toHaveBeenCalledWith(expect.objectContaining({ message: 'Create design/F-4-new-card.md' }) as CommitRequest)
        expect(storage.push).toHaveBeenCalledWith({ branch: 'main', id: 'project' })
    })

    it('leaves commits unpushed in manual mode', async () => {
        const storage = createStorage()
        const service = new DataService()
        service.init({ config: { cardTypes: DEFAULT_CARD_TYPES, pushMode: 'manual', workingFolder: 'design' }, storage })

        await service.openProject({ branch: 'main', id: 'project' })
        await service.createCard({ body: 'Body', title: 'New Card', type: 'feature' })

        expect(storage.commit).toHaveBeenCalledTimes(1)
        expect(storage.push).not.toHaveBeenCalled()
    })
})
