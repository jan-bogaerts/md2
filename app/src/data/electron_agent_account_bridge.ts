import type { AgentAccount } from './agent_accounts';

/** Login status reported by the desktop agent account service. */
export type DesktopAgentAccountStatus =
    | 'available'
    | 'directoryUnavailable'
    | 'loginInProgress'
    | 'loginRequired'
    | 'notIsolated';

/** Narrow desktop bridge for agent account metadata and lifecycle; it never returns credential contents. */
export interface ElectronAgentAccountBridge {
    addAgentAccount(agent: string): Promise<AgentAccount | null>
    listAgentAccounts(): Promise<AgentAccount[]>
    loadAgentAccountStatus(accountId: string): Promise<DesktopAgentAccountStatus>
    loginAgentAccount(accountId: string): Promise<DesktopAgentAccountStatus>
    removeAgentAccount(accountId: string): Promise<void>
    renameAgentAccount(accountId: string, name: string): Promise<AgentAccount>
    reselectAgentAccountDirectory(accountId: string): Promise<AgentAccount | null>
}

declare global {
    interface Window {
        md2AgentAccounts?: ElectronAgentAccountBridge
    }
}

export function getElectronAgentAccountBridge() {
    return window.md2AgentAccounts ?? null;
}
