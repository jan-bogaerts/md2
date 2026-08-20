import type { AgentConversation } from '../app/src/data/data_types.ts'

/** Parse one canonical conversation record while discarding malformed optional entries. */
export function parseAgentConversation(content: string, referencePath: string): AgentConversation
/** Parse one canonical conversation value while discarding malformed optional entries. */
export function parseAgentConversationValue(value: unknown, referencePath: string): AgentConversation
/** Bound one command or tool result while retaining useful beginning and ending context. */
export function boundedAgentResult(value: string): string
export interface BoundedAgentResultState {
    head: string
    tail: string
    totalLength: number
}
export function appendBoundedAgentResult(
    state: BoundedAgentResultState | null,
    chunk: string,
): { state: BoundedAgentResultState; value: string }
export const AGENT_RESULT_MAX_LENGTH: 8192
export const AGENT_CONVERSATION_USAGE_SCHEMA_VERSION: 1
