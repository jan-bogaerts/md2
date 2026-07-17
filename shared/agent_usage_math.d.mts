import type { AgentTokenUsage } from '../app/src/data/data_types.ts'

export function sumAgentTokenUsage(usages: Array<AgentTokenUsage | undefined>): AgentTokenUsage
