import type { AgentConversation } from '../app/src/data/data_types.ts'

/** Parse one canonical conversation record while discarding malformed optional entries. */
export function parseAgentConversation(content: string, referencePath: string): AgentConversation
