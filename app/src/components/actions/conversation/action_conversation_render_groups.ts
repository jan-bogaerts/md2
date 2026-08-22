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
 * The spawning `Agent` call names the sub agent in its input, but that input is still partial JSON
 * while the call streams, so a label already carried by the sub agent's own entries is the fallback.
 */
function subAgentLabel(entry: AgentConversationEventEntry, children: AgentConversationEventEntry[]) {
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
        .filter((entry): entry is AgentConversationEventEntry => (
            entry.kind === 'event' && entry.type === 'tool.Agent' && !!entry.providerItemId
        ))
        .map((entry) => [entry.providerItemId as string, entry]))
}

function isDescendantOf(
    entry: AgentConversationEntry,
    ancestorId: string,
    agentCalls: Map<string, AgentConversationEventEntry>,
) {
    if (entry.kind !== 'event') return false
    const visitedParentIds = new Set<string>()
    let parentItemId = entry.parentItemId
    while (parentItemId) {
        if (parentItemId === ancestorId) return true
        if (visitedParentIds.has(parentItemId)) return false
        visitedParentIds.add(parentItemId)
        parentItemId = agentCalls.get(parentItemId)?.parentItemId
    }

    return false
}

function buildGroups(entries: AgentConversationEntry[], agentCalls: Map<string, AgentConversationEventEntry>) {
    const groups: ActionConversationRenderGroup[] = []
    let completedToolCalls: AgentConversationEventEntry[] = []

    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]
        const isAgentCall = entry.kind === 'event' && entry.type === 'tool.Agent' && !!entry.providerItemId
        if (entry.kind === 'event' && !isAgentCall && isCompletedToolCall(entry)) {
            completedToolCalls.push(entry)
            continue
        }

        appendCompletedToolCallRun(groups, completedToolCalls)
        completedToolCalls = []
        if (isAgentCall) {
            const descendants: AgentConversationEventEntry[] = []
            while (index + 1 < entries.length && isDescendantOf(entries[index + 1], entry.providerItemId as string, agentCalls)) {
                index += 1
                descendants.push(entries[index] as AgentConversationEventEntry)
            }
            if (descendants.length === 0) {
                groups.push({ entry, key: eventIdentity(entry), kind: 'entry' })
                continue
            }
            groups.push({
                entry,
                groups: buildGroups(descendants, agentCalls),
                key: eventIdentity(entry),
                kind: 'subAgent',
                label: subAgentLabel(entry, descendants),
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
    return buildGroups(entries, agentCallsByProviderId(entries))
}
