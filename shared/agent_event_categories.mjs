/**
 * One classifier for provider event types, shared by the tool-call count in `project_stats.mjs`
 * and the tool-time measurement in `agent_conversation_phases.js`. Keeping both on this module is
 * what stops "how many tool calls" and "how much tool time" from disagreeing about what a tool is.
 */

const CODEX_TOOL_EVENT_TYPES = new Set([
    'collabAgentToolCall',
    'commandExecution',
    'dynamicToolCall',
    'fileChange',
    'imageView',
    'mcpToolCall',
    'webSearch',
])

/** Provider item lifecycle states after which an item does no more work. */
const TERMINAL_PROVIDER_EVENT_STATUSES = new Set(['aborted', 'cancelled', 'completed', 'declined', 'failed'])

/** True for the event types that represent a tool call, for both Claude (`tool.*`) and Codex. */
export function isToolCallEventType(type) {
    if (typeof type !== 'string') return false
    if (type.startsWith('tool.')) return type !== 'tool.result'

    return CODEX_TOOL_EVENT_TYPES.has(type)
}

/** True for a transcript entry that represents a tool call. */
export function isToolCallEvent(entry) {
    if (entry.kind !== 'event') return false

    return isToolCallEventType(entry.type)
}

/**
 * The duration component an event type belongs to, or null when it opens no span and therefore
 * lands in agent time (assistant text, diagnostics, system, `agentQuestion`, `contextCompaction`).
 */
export function providerEventCategory(type) {
    if (type === 'reasoning') return 'reasoning'

    return isToolCallEventType(type) ? 'tool' : null
}

export function isTerminalProviderEventStatus(status) {
    return typeof status === 'string' && TERMINAL_PROVIDER_EVENT_STATUSES.has(status)
}
