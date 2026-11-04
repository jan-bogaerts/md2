export type AgentAccountKind = 'initial' | 'directory'

export interface InitialAgentAccount {
    id: string
    agent: string
    kind: 'initial'
    name: string
}

export interface DirectoryAgentAccount {
    id: string
    agent: string
    kind: 'directory'
    name: string
    configDirectory: string
}

export type AgentAccount = InitialAgentAccount | DirectoryAgentAccount

export const ACCOUNT_AGENTS: string[]
export const INITIAL_ACCOUNT_KIND: 'initial'
export const DIRECTORY_ACCOUNT_KIND: 'directory'
export const DEFAULT_AGENT_ACCOUNTS: AgentAccount[]
export function initialAgentAccountId(agent: string): string
export function supportsAgentAccounts(agent: string): boolean
export function validateAgentAccounts(value: unknown, source: string): AgentAccount[]
export function resolveAgentAccounts(value: unknown, source: string): AgentAccount[]
export function findAgentAccount(accounts: AgentAccount[], accountId: string): AgentAccount | null
export function resolveAgentAccount(
    accounts: AgentAccount[], agent: string, accountId?: string, defaultAccountId?: string,
): AgentAccount | null
