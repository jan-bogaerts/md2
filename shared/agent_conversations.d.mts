import type { AgentConversation } from '../app/src/data/data_types.ts'

/** Parse one canonical conversation record while discarding malformed optional entries. */
export function parseAgentConversation(content: string, referencePath: string): AgentConversation
export const AGENT_CONVERSATION_USAGE_SCHEMA_VERSION: 1
