import type {
    AgentConversationEntry,
    AgentConversationEventEntry,
} from '../../../data/data_types'
import { eventIdentity } from './event_display'

const TOOL_CALL_EVENT_TYPES = new Set([
    'collabAgentToolCall',
    'commandExecution',
    'dynamicToolCall',
    'fileChange',
    'imageView',
    'mcpToolCall',
    'webSearch',
])
const DEFAULT_SUB_AGENT_LABEL = 'Sub agent'

export type ActionConversationRenderGroup = {
    entries: AgentConversationEventEntry[]
    key: string
    kind: 'completedToolCalls'
} | {
    entry: AgentConversationEntry
    key: string
    kind: 'entry'
} | {
    entry: AgentConversationEventEntry
    groups: ActionConversationRenderGroup[]
    key: string
    kind: 'subAgent'
    label: string
    runningCount: number
}

function isToolCall(entry: AgentConversationEventEntry) {
    return TOOL_CALL_EVENT_TYPES.has(entry.type) || entry.type.startsWith('tool.')
}

function isCompletedToolCall(entry: AgentConversationEventEntry) {
    return entry.status === 'completed' && isToolCall(entry)
}

function appendCompletedToolCallRun(
    groups: ActionConversationRenderGroup[],
    entries: AgentConversationEventEntry[],
) {
    if (entries.length === 0) return
    if (entries.length === 1) {
        const [entry] = entries
        groups.push({ entry, key: eventIdentity(entry), kind: 'entry' })
        return
    }

    groups.push({ entries, key: eventIdentity(entries[0]), kind: 'completedToolCalls' })
}

function parsedToolInput(content: string) {
    try {
        const parsed: unknown = JSON.parse(content)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

        return parsed as Record<string, unknown>
    } catch {
        return null
    }
}

/**
 * Claude's `Agent` call and Codex's `collabAgentToolCall` both spawn sub agents whose entries name them
 * through `parentItemId`.
 */
function isSpawningCall(entry: AgentConversationEntry): entry is AgentConversationEventEntry {
    if (entry.kind !== 'event' || !entry.providerItemId) return false

    return entry.type === 'tool.Agent' || entry.type === 'collabAgentToolCall'
}

/**
 * The spawning `Agent` call names the sub agent in its input, but that input is still partial JSON
 * while the call streams, so a label already carried by the sub agent's own entries is the fallback.
 * A Codex collaboration call already carries `Collaboration: <tool>` as its label, so its content, which
 * holds the prompt rather than tool input, is never parsed.
 */
function subAgentLabel(entry: AgentConversationEventEntry, children: AgentConversationEventEntry[]) {
    if (entry.type === 'collabAgentToolCall') return entry.label ?? DEFAULT_SUB_AGENT_LABEL
    const input = parsedToolInput(entry.content)
    const subagentType = input?.subagent_type
    if (typeof subagentType === 'string' && subagentType.length > 0) return subagentType
    const description = input?.description
    if (typeof description === 'string' && description.length > 0) return description
    const labelled = children.find((child) => (
        child.type === 'agentMessage' && typeof child.label === 'string' && child.label.length > 0
    ))

    return labelled?.label ?? DEFAULT_SUB_AGENT_LABEL
}

function agentCallsByProviderId(entries: AgentConversationEntry[]) {
    return new Map(entries
        .filter(isSpawningCall)
        .map((entry) => [entry.providerItemId as string, entry]))
}

function hasOwnershipCycle(entry: AgentConversationEventEntry, agentCalls: Map<string, AgentConversationEventEntry>) {
    if (!entry.providerItemId) return false
    const visitedParentIds = new Set<string>()
    let parentItemId = entry.parentItemId
    while (parentItemId) {
        if (parentItemId === entry.providerItemId || visitedParentIds.has(parentItemId)) return true
        visitedParentIds.add(parentItemId)
        parentItemId = agentCalls.get(parentItemId)?.parentItemId
    }

    return false
}

function childEntriesByParentId(
    entries: AgentConversationEntry[],
    agentCalls: Map<string, AgentConversationEventEntry>,
) {
    const childEntries = new Map<string, AgentConversationEventEntry[]>()
    const ownedEntries = new Set<AgentConversationEventEntry>()
    for (const entry of entries) {
        if (entry.kind !== 'event' || !entry.parentItemId || !agentCalls.has(entry.parentItemId)) continue
        if (hasOwnershipCycle(entry, agentCalls)) continue
        const children = childEntries.get(entry.parentItemId) ?? []
        children.push(entry)
        childEntries.set(entry.parentItemId, children)
        ownedEntries.add(entry)
    }

    return { childEntries, ownedEntries }
}

function shouldRenderSubAgentGroup(entry: AgentConversationEventEntry, descendants: AgentConversationEventEntry[]) {
    if (descendants.length > 0) return true

    return entry.type === 'collabAgentToolCall'
        && (entry.status !== 'completed' || (entry.runningSubThreads ?? 0) > 0)
}

function buildGroups(
    entries: AgentConversationEntry[],
    agentCalls: Map<string, AgentConversationEventEntry>,
    childEntries: Map<string, AgentConversationEventEntry[]>,
) {
    const groups: ActionConversationRenderGroup[] = []
    let completedToolCalls: AgentConversationEventEntry[] = []

    for (const entry of entries) {
        const descendants = isSpawningCall(entry) ? childEntries.get(entry.providerItemId as string) ?? [] : []
        const isAgentCall = isSpawningCall(entry) && shouldRenderSubAgentGroup(entry, descendants)
        if (entry.kind === 'event' && !isAgentCall && isCompletedToolCall(entry)) {
            completedToolCalls.push(entry)
            continue
        }

        appendCompletedToolCallRun(groups, completedToolCalls)
        completedToolCalls = []
        if (isAgentCall) {
            groups.push({
                entry,
                groups: buildGroups(descendants, agentCalls, childEntries),
                key: eventIdentity(entry),
                kind: 'subAgent',
                label: subAgentLabel(entry, descendants),
                runningCount: entry.runningSubThreads ?? 0,
            })
            continue
        }
        const key = entry.kind === 'event' ? eventIdentity(entry) : entry.id
        groups.push({ entry, key, kind: 'entry' })
    }

    appendCompletedToolCallRun(groups, completedToolCalls)

    return groups
}

/** Builds UI-only groups without changing canonical conversation entries. */
export function buildActionConversationRenderGroups(entries: AgentConversationEntry[]) {
    const agentCalls = agentCallsByProviderId(entries)
    const { childEntries, ownedEntries } = childEntriesByParentId(entries, agentCalls)
    const rootEntries = entries.filter((entry) => entry.kind !== 'event' || !ownedEntries.has(entry))

    return buildGroups(rootEntries, agentCalls, childEntries)
}
