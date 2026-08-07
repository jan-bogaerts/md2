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

export type ActionConversationRenderGroup = {
    entries: AgentConversationEventEntry[]
    key: string
    kind: 'completedToolCalls'
} | {
    entry: AgentConversationEntry
    key: string
    kind: 'entry'
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

/** Builds UI-only groups without changing canonical conversation entries. */
export function buildActionConversationRenderGroups(entries: AgentConversationEntry[]) {
    const groups: ActionConversationRenderGroup[] = []
    let completedToolCalls: AgentConversationEventEntry[] = []

    for (const entry of entries) {
        if (entry.kind === 'event' && isCompletedToolCall(entry)) {
            completedToolCalls.push(entry)
            continue
        }

        appendCompletedToolCallRun(groups, completedToolCalls)
        completedToolCalls = []
        const key = entry.kind === 'event' ? eventIdentity(entry) : entry.id
        groups.push({ entry, key, kind: 'entry' })
    }

    appendCompletedToolCallRun(groups, completedToolCalls)

    return groups
}
