import { describe, expect, it } from 'vitest'
import type { CardHeader, ProjectCard, ProjectSnapshot } from '../../data/data_types'
import { InvalidSearchPatternError, defaultSearchRegexpAgent, searchProject } from './search_project'

function makeHeader(overrides: Partial<CardHeader> = {}): CardHeader {
    return {
        affects: [],
        after: null,
        agentLogReferences: [],
        author: null,
        id: 'F-1',
        internalId: null,
        owner: null,
        policy: {},
        status: null,
        title: 'Untitled',
        ...overrides,
    }
}

function makeCard(path: string, content: string, header: Partial<CardHeader>, isActive: boolean): ProjectCard {
    return { agentConversationErrors: [], agentConversations: [], content, header: makeHeader(header), isActive, path }
}

const activeAlpha = makeCard(
    'design/F-1-alpha.md',
    '# Alpha\n\nThe quick brown fox jumps over the lazy dog.',
    { id: 'F-1', title: 'Alpha feature', status: 'ready' },
    true,
)
const activeBeta = makeCard(
    'design/F-2-beta.md',
    '# Beta\n\nNothing notable here.',
    { id: 'F-2', title: 'Beta feature', owner: 'JB' },
    true,
)
const historyCard = makeCard(
    'design/history/2026-01-change.md',
    '# Change\n\nThis body mentions the fox again.',
    { id: 'H-1', title: 'History change', status: 'archived' },
    false,
)
const architectureCard = makeCard(
    'design/architecture/overview.md',
    '# Overview\n\nArchitecture body with the word fox inside.',
    { id: 'A-1', title: 'Architecture overview' },
    false,
)

const snapshot: ProjectSnapshot = {
    activeCards: [activeAlpha, activeBeta],
    backgroundCards: [historyCard, architectureCard],
    repositoryFiles: [],
    workingFolder: 'design',
}

describe('searchProject', () => {
    it('returns no results for an empty query', () => {
        const results = searchProject(snapshot, '   ', { includeBackgroundBody: false, mode: 'text' })

        expect(results.active).toHaveLength(0)
        expect(results.backgroundGroups).toHaveLength(0)
    })

    it('matches active cards by full body content and marks the body source', () => {
        const results = searchProject(snapshot, 'brown fox', { includeBackgroundBody: false, mode: 'text' })

        expect(results.active).toHaveLength(1)
        expect(results.active[0].path).toBe('design/F-1-alpha.md')
        expect(results.active[0].source).toBe('body')
        expect(results.active[0].context).toContain('brown fox')
    })

    it('matches header fields and reports the header source and field', () => {
        const results = searchProject(snapshot, 'Beta feature', { includeBackgroundBody: false, mode: 'text' })

        expect(results.active).toHaveLength(1)
        expect(results.active[0].source).toBe('header')
        expect(results.active[0].field).toBe('title')
    })

    it('searches case-insensitively for plain text', () => {
        const results = searchProject(snapshot, 'ALPHA FEATURE', { includeBackgroundBody: false, mode: 'text' })

        expect(results.active).toHaveLength(1)
        expect(results.active[0].path).toBe('design/F-1-alpha.md')
    })

    it('searches background cards by header only by default', () => {
        const results = searchProject(snapshot, 'fox', { includeBackgroundBody: false, mode: 'text' })

        expect(results.active).toHaveLength(1)
        expect(results.backgroundGroups).toHaveLength(0)
    })

    it('includes background bodies when full search is enabled and groups them by folder', () => {
        const results = searchProject(snapshot, 'fox', { includeBackgroundBody: true, mode: 'text' })

        const folders = results.backgroundGroups.map((group) => group.folder)
        expect(folders).toEqual(['history', 'architecture'])
        expect(results.backgroundGroups[0].matches[0].source).toBe('body')
    })

    it('matches background header fields regardless of the body toggle', () => {
        const results = searchProject(snapshot, 'archived', { includeBackgroundBody: false, mode: 'text' })

        expect(results.backgroundGroups).toHaveLength(1)
        expect(results.backgroundGroups[0].folder).toBe('history')
        expect(results.backgroundGroups[0].matches[0].source).toBe('header')
    })

    it('supports valid RegExp queries', () => {
        const results = searchProject(snapshot, 'F-\\d', { includeBackgroundBody: false, mode: 'regexp' })

        expect(results.active).toHaveLength(2)
    })

    it('throws InvalidSearchPatternError for an invalid RegExp query', () => {
        expect(() => searchProject(snapshot, '(', { includeBackgroundBody: false, mode: 'regexp' })).toThrow(
            InvalidSearchPatternError,
        )
    })
})

describe('defaultSearchRegexpAgent', () => {
    it('reports that the agent is unavailable', async () => {
        await expect(defaultSearchRegexpAgent('find todos')).rejects.toThrow('RegExp agent is not available')
    })
})
