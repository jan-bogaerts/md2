import type { CardHeader, ProjectCard, ProjectSnapshot } from '../../data/data_types'
import type { ActionDefinition } from '../../data/action_types'
import type {
    ActionSearchMatch, BackgroundGroup, SearchMatch, SearchOptions, SearchRegexpAgent, SearchResults,
} from './search_types'

const CONTEXT_RADIUS = 40
const ELLIPSIS = '…'
const ROOT_GROUP = '(root)'
const BODY_FIELD = 'body'

/** Thrown when a RegExp-mode query is not a valid regular expression. */
export class InvalidSearchPatternError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'InvalidSearchPatternError'
    }
}

interface MatchLocation {
    index: number
    length: number
}

interface Matcher {
    find(text: string): MatchLocation | null
}

interface HeaderField {
    field: string
    value: string
}

interface ActionSearchField {
    field: ActionSearchMatch['field']
    value: string
}

function createTextMatcher(query: string): Matcher {
    const needle = query.toLowerCase()

    return {
        find(text: string) {
            const index = text.toLowerCase().indexOf(needle)

            return index === -1 ? null : { index, length: query.length }
        },
    }
}

function createRegexpMatcher(query: string): Matcher {
    let expression: RegExp

    try {
        expression = new RegExp(query)
    } catch (error) {
        throw new InvalidSearchPatternError(error instanceof Error ? error.message : 'Invalid regular expression')
    }

    return {
        find(text: string) {
            const found = text.match(expression)

            return found?.index === undefined ? null : { index: found.index, length: found[0].length }
        },
    }
}

function createMatcher(query: string, options: SearchOptions): Matcher {
    return options.mode === 'regexp' ? createRegexpMatcher(query) : createTextMatcher(query)
}

function collectHeaderFields(header: CardHeader): HeaderField[] {
    const fields: HeaderField[] = []
    const scalarEntries: [string, string | null][] = [
        ['id', header.id],
        ['title', header.title],
        ['status', header.status],
        ['owner', header.owner],
        ['author', header.author],
        ['after', header.after],
        ['internalId', header.internalId],
    ]

    for (const [field, value] of scalarEntries) {
        if (value) fields.push({ field, value })
    }

    for (const entry of header.affects) fields.push({ field: 'affects', value: entry })
    for (const [key, value] of Object.entries(header.policy)) fields.push({ field: `policy.${key}`, value: value ? 'true' : 'false' })

    return fields
}

function buildContext(text: string, location: MatchLocation): string {
    const start = Math.max(0, location.index - CONTEXT_RADIUS)
    const end = Math.min(text.length, location.index + location.length + CONTEXT_RADIUS)
    const slice = text.slice(start, end).replace(/\s+/gu, ' ').trim()
    const prefix = start > 0 ? ELLIPSIS : ''
    const suffix = end < text.length ? ELLIPSIS : ''

    return `${prefix}${slice}${suffix}`
}

function matchCard(card: ProjectCard, matcher: Matcher, searchBody: boolean): SearchMatch | null {
    const headerFields = collectHeaderFields(card.header)

    for (const { field, value } of headerFields) {
        const location = matcher.find(value)
        if (location) {
            return { card, context: buildContext(value, location), field, path: card.path, source: 'header', title: card.header.title }
        }
    }

    if (searchBody) {
        const location = matcher.find(card.content)
        if (location) {
            return { card, context: buildContext(card.content, location), field: BODY_FIELD, path: card.path, source: 'body', title: card.header.title }
        }
    }

    return null
}

function collectActionFields(action: ActionDefinition): ActionSearchField[] {
    const fields: ActionSearchField[] = [
        { field: 'label', value: action.label },
        { field: 'description', value: action.description },
        { field: 'name', value: action.name },
    ]
    if (action.prompt) fields.push({ field: 'text', value: action.prompt })
    if (action.command) fields.push({ field: 'text', value: action.command })

    return fields
}

function matchAction(action: ActionDefinition, matcher: Matcher): ActionSearchMatch | null {
    for (const { field, value } of collectActionFields(action)) {
        const location = matcher.find(value)
        if (location) return { action, context: buildContext(value, location), field, title: action.label }
    }

    return null
}

function backgroundGroupKey(path: string, workingFolder: string): string {
    const normalized = path.replace(/\\/gu, '/')
    const prefix = `${workingFolder}/`
    const rest = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
    const segments = rest.split('/')

    return segments.length > 1 ? segments[0] : ROOT_GROUP
}

function groupBackgroundMatches(matches: SearchMatch[], workingFolder: string): BackgroundGroup[] {
    const groups: BackgroundGroup[] = []
    const byFolder = new Map<string, BackgroundGroup>()

    for (const match of matches) {
        const folder = backgroundGroupKey(match.path, workingFolder)
        const existing = byFolder.get(folder)

        if (existing) {
            existing.matches.push(match)
            continue
        }

        const group: BackgroundGroup = { folder, matches: [match] }
        byFolder.set(folder, group)
        groups.push(group)
    }

    return groups
}

/**
 * Searches a loaded project snapshot. Active cards are matched by header fields and full body;
 * background cards are matched by header fields, and by body only when `includeBackgroundBody` is set.
 * Throws {@link InvalidSearchPatternError} for an invalid RegExp-mode query.
 */
export function searchProject(snapshot: ProjectSnapshot, query: string, options: SearchOptions): SearchResults {
    if (query.trim().length === 0) return { active: [], actions: [], backgroundGroups: [] }

    const matcher = createMatcher(query, options)
    const active = snapshot.activeCards
        .map((card) => matchCard(card, matcher, true))
        .filter((match): match is SearchMatch => match !== null)
    const backgroundMatches = snapshot.backgroundCards
        .map((card) => matchCard(card, matcher, options.includeBackgroundBody))
        .filter((match): match is SearchMatch => match !== null)

    return { active, actions: [], backgroundGroups: groupBackgroundMatches(backgroundMatches, snapshot.workingFolder) }
}

/**
 * Searches loaded action definitions by label, description, name and text.
 * Throws {@link InvalidSearchPatternError} for an invalid RegExp-mode query.
 */
export function searchActions(actions: ActionDefinition[], query: string, options: SearchOptions): ActionSearchMatch[] {
    if (!options.includeActions || query.trim().length === 0) return []

    const matcher = createMatcher(query, options)

    return actions
        .filter((action) => !action.builtin)
        .map((action) => matchAction(action, matcher))
        .filter((match): match is ActionSearchMatch => match !== null)
}

/** Placeholder agent used until real agent execution is wired up; always reports unavailable. */
export const defaultSearchRegexpAgent: SearchRegexpAgent = async () => {
    throw new Error('RegExp agent is not available')
}
