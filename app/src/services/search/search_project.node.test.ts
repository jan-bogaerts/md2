import { describe, expect, it } from 'vitest'
import type { CardHeader, Card, ProjectSnapshot } from '../../data/data_types'
import type { ActionDefinition } from '../../data/action_types'
import { InvalidSearchPatternError, defaultSearchRegexpAgent, searchActions, searchProject } from './search_project'

function makeHeader(overrides: Partial<CardHeader> = {}): CardHeader {
    return {
        affects: [],
        after: null,
        agentLogReferences: [],
        changedFiles: [],
        author: null,
        id: 'F-1',
        internalId: null,
        owner: null,
        policy: {},
        references: [],
        status: null,
        title: 'Untitled',
        ...overrides,
    }
}

function makeCard(path: string, content: string, header: Partial<CardHeader>, isActive: boolean): Card {
    return {
        agentConversationErrors: [], agentConversations: [], content, hasFrontmatter: true,
        header: makeHeader(header), isActive, path,
    }
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

function action(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
    return {
        agent: null,
        appliesTo: null,
        builtin: false,
        command: null,
        description: 'Create release notes from current changes',
        icon: null,
        id: 'action-release-notes',
        label: 'Release notes',
        model: null,
        needsWorkTree: false,
        on: [],
        onAfter: [],
        onBefore: [],
        onState: null,
        prompt: 'Summarize commits for release',
        sourcePath: 'actions/release-notes.json',
        thinkingLevel: null,
        trackFileChanges: false,
        type: 'agent',
        ...overrides,
        output: overrides.output ?? null,
        permissionMode: overrides.permissionMode ?? null,
        phrases: overrides.phrases ?? [],
        showCommandWindow: overrides.showCommandWindow ?? false,
        streaming: overrides.streaming ?? false,
    }
}

const searchOptions = { includeActions: false, includeBackgroundBody: false, mode: 'text' as const }

describe('searchProject', () => {
    it('returns no results for an empty query', () => {
        const results = searchProject(snapshot, '   ', searchOptions)

        expect(results.active).toHaveLength(0)
        expect(results.actions).toHaveLength(0)
        expect(results.backgroundGroups).toHaveLength(0)
    })

    it('matches active cards by full body content and marks the body source', () => {
        const results = searchProject(snapshot, 'brown fox', searchOptions)

        expect(results.active).toHaveLength(1)
        expect(results.active[0].path).toBe('design/F-1-alpha.md')
        expect(results.active[0].source).toBe('body')
        expect(results.active[0].context).toContain('brown fox')
    })

    it('matches header fields and reports the header source and field', () => {
        const results = searchProject(snapshot, 'Beta feature', searchOptions)

        expect(results.active).toHaveLength(1)
        expect(results.active[0].source).toBe('header')
        expect(results.active[0].field).toBe('title')
    })

    it('searches case-insensitively for plain text', () => {
        const results = searchProject(snapshot, 'ALPHA FEATURE', searchOptions)

        expect(results.active).toHaveLength(1)
        expect(results.active[0].path).toBe('design/F-1-alpha.md')
    })

    it('searches background cards by header only by default', () => {
        const results = searchProject(snapshot, 'fox', searchOptions)

        expect(results.active).toHaveLength(1)
        expect(results.backgroundGroups).toHaveLength(0)
    })

    it('includes background bodies when full search is enabled and groups them by folder', () => {
        const results = searchProject(snapshot, 'fox', { ...searchOptions, includeBackgroundBody: true })

        const folders = results.backgroundGroups.map((group) => group.folder)
        expect(folders).toEqual(['history', 'architecture'])
        expect(results.backgroundGroups[0].matches[0].source).toBe('body')
    })

    it('matches background header fields regardless of the body toggle', () => {
        const results = searchProject(snapshot, 'archived', searchOptions)

        expect(results.backgroundGroups).toHaveLength(1)
        expect(results.backgroundGroups[0].folder).toBe('history')
        expect(results.backgroundGroups[0].matches[0].source).toBe('header')
    })

    it('groups nested configured release and archived folders by their configured names', () => {
        const configuredSnapshot = {
            ...snapshot,
            backgroundCards: [
                makeCard(
                    'design/records/releases/v1/F-3.md',
                    '',
                    { id: 'F-3', status: 'archived', title: 'Released' },
                    false,
                ),
                makeCard(
                    'design/records/archived/F-4.md',
                    '',
                    { id: 'F-4', status: 'archived', title: 'Archived' },
                    false,
                ),
            ],
        }
        const results = searchProject(
            configuredSnapshot,
            'archived',
            searchOptions,
            ['design/records/releases', 'design/records/archived'],
        )

        expect(results.backgroundGroups.map(({ folder }) => folder)).toEqual(['releases', 'archived'])
    })

    it('supports valid RegExp queries', () => {
        const results = searchProject(snapshot, 'F-\\d', { ...searchOptions, mode: 'regexp' })

        expect(results.active).toHaveLength(2)
    })

    it('throws InvalidSearchPatternError for an invalid RegExp query', () => {
        expect(() => searchProject(snapshot, '(', { ...searchOptions, mode: 'regexp' })).toThrow(
            InvalidSearchPatternError,
        )
    })
})

describe('searchActions', () => {
    it('returns no matches when action search is disabled', () => {
        const results = searchActions([action()], 'Release notes', searchOptions)

        expect(results).toHaveLength(0)
    })

    it('matches action label, description and text', () => {
        const actions = [
            action({ label: 'Deploy service' }),
            action({ description: 'Runs migration plan', label: 'Migrate' }),
            action({ label: 'Summarize', prompt: 'Write changelog entry' }),
        ]
        const options = { ...searchOptions, includeActions: true }

        expect(searchActions(actions, 'Deploy service', options)[0].field).toBe('label')
        expect(searchActions(actions, 'migration plan', options)[0].field).toBe('description')
        expect(searchActions(actions, 'changelog', options)[0].field).toBe('text')
    })

    it('supports RegExp mode for actions', () => {
        const results = searchActions([action({ description: 'Unrelated', label: 'Release notes' })], 'Release.+', {
            ...searchOptions,
            includeActions: true,
            mode: 'regexp',
        })

        expect(results[0].field).toBe('label')
    })
})

describe('defaultSearchRegexpAgent', () => {
    it('reports that the agent is unavailable', async () => {
        await expect(defaultSearchRegexpAgent('find todos')).rejects.toThrow('RegExp agent is not available')
    })
})
