import type { AgentAccount } from '../../data/agent_accounts';
import {
    getElectronAgentAccountBridge,
    type DesktopAgentAccountStatus,
    type ElectronAgentAccountBridge,
} from '../../data/electron_agent_account_bridge';
import { configService, type ConfigService } from '../config/config_service';
import { dialogService, type DialogService } from '../dialog_service';
import { register } from '../service_injector';

/** Desktop status, `checking` while a status request runs, or `unknown` when the status request failed. */
export type AgentAccountStatus = DesktopAgentAccountStatus | 'checking' | 'unknown';

type AgentAccountBridgeProvider = () => ElectronAgentAccountBridge | null;

const NO_ACCOUNTS: AgentAccount[] = [];

/** Event fired when the account list of one agent changes. */
export function agentAccountsChangedEvent(agent: string) {
    return `accounts:${agent}`;
}

/** Event fired when the login status of one account changes. */
export function agentAccountStatusChangedEvent(accountId: string) {
    return `status:${accountId}`;
}

function hasSameAccounts(first: AgentAccount[], second: AgentAccount[]) {
    return first.length === second.length && first.every((account, index) => account === second[index]);
}

/**
 * Owns renderer account metadata and login status for agent accounts. Lifecycle work runs in the desktop
 * account service; this service only keeps metadata and status, never credential content.
 */
export class AgentAccountService extends EventTarget {
    private accounts: AgentAccount[] = [];
    private accountsByAgent = new Map<string, AgentAccount[]>();
    private readonly bridgeProvider: AgentAccountBridgeProvider;
    private readonly config: ConfigService;
    private readonly dialogs: DialogService;
    private readonly statuses = new Map<string, AgentAccountStatus>();

    constructor(
        bridgeProvider: AgentAccountBridgeProvider = getElectronAgentAccountBridge,
        dialogs: DialogService = dialogService,
        config: ConfigService = configService,
    ) {
        super();
        this.bridgeProvider = bridgeProvider;
        this.config = config;
        this.dialogs = dialogs;
        register('agentAccountService', this);
    }

    isAvailable() {
        return !!this.bridgeProvider();
    }

    /** Accounts of one agent in configuration order; the reference stays stable until that agent's accounts change. */
    getAccounts(agent: string) {
        return this.accountsByAgent.get(agent) ?? NO_ACCOUNTS;
    }

    getAccount(accountId: string) {
        return this.accounts.find(({ id }) => id === accountId) ?? null;
    }

    getStatus(accountId: string): AgentAccountStatus {
        return this.statuses.get(accountId) ?? 'checking';
    }

    /** Loads account metadata and then the login status of every account. */
    async load() {
        try {
            const accounts = await this.requireBridge().listAgentAccounts();
            this.replaceAccounts(accounts);
            await Promise.all(accounts.map(({ id }) => this.refreshStatus(id)));
        } catch (error) {
            this.dialogs.error(error, { fallbackMessage: 'Agent accounts could not be loaded' });
        }
    }

    /** Lets the user pick a folder; a created account is shown immediately and its provider login starts. */
    async addAccount(agent: string) {
        let account: AgentAccount | null = null;
        try {
            account = await this.requireBridge().addAgentAccount(agent);
        } catch (error) {
            this.dialogs.error(error, { fallbackMessage: 'Agent account could not be added' });
        }
        if (!account) return;
        this.replaceAccounts([...this.accounts, account]);
        await this.login(account.id);
    }

    /** Runs the provider login; a cancelled or failed login only changes this account's status. */
    async login(accountId: string) {
        this.setStatus(accountId, 'loginInProgress');
        try {
            const status = await this.requireBridge().loginAgentAccount(accountId);
            this.setStatus(accountId, status);
        } catch (error) {
            this.dialogs.error(error, { fallbackMessage: 'Agent account login failed' });
            await this.refreshStatus(accountId);
        }
    }

    /** Changes only the display name; the account ID and folder stay unchanged. */
    async rename(accountId: string, name: string) {
        try {
            const account = await this.requireBridge().renameAgentAccount(accountId, name);
            this.replaceAccount(account);
        } catch (error) {
            this.dialogs.error(error, { fallbackMessage: 'Agent account could not be renamed' });
        }
    }

    /** Points a directory account at another folder, keeping its ID; a cancelled picker changes nothing. */
    async reselectDirectory(accountId: string) {
        try {
            const account = await this.requireBridge().reselectAgentAccountDirectory(accountId);
            if (!account) return;
            this.replaceAccount(account);
        } catch (error) {
            this.dialogs.error(error, { fallbackMessage: 'Agent account folder could not be changed' });
            return;
        }
        await this.refreshStatus(accountId);
    }

    /** Removes the account record only; its folder and credentials stay on disk. */
    async remove(accountId: string) {
        try {
            await this.requireBridge().removeAgentAccount(accountId);
        } catch (error) {
            this.dialogs.error(error, { fallbackMessage: 'Agent account could not be removed' });
            return;
        }
        this.statuses.delete(accountId);
        this.replaceAccounts(this.accounts.filter(({ id }) => id !== accountId));
    }

    private async refreshStatus(accountId: string) {
        this.setStatus(accountId, 'checking');
        try {
            const status = await this.requireBridge().loadAgentAccountStatus(accountId);
            this.setStatus(accountId, status);
        } catch (error) {
            this.setStatus(accountId, 'unknown');
            this.dialogs.error(error, { fallbackMessage: 'Agent account status could not be loaded' });
        }
    }

    private replaceAccount(account: AgentAccount) {
        const accounts = this.accounts.map((candidate) => (candidate.id === account.id ? account : candidate));
        this.replaceAccounts(accounts);
    }

    /** Stores the persisted accounts, mirrors them into the config, and notifies only agents whose accounts changed. */
    private replaceAccounts(accounts: AgentAccount[]) {
        const previousByAgent = this.accountsByAgent;
        const nextByAgent = new Map<string, AgentAccount[]>();
        for (const account of accounts) {
            const agentAccounts = nextByAgent.get(account.agent) ?? [];
            agentAccounts.push(account);
            nextByAgent.set(account.agent, agentAccounts);
        }
        const changedAgents = new Set([...previousByAgent.keys(), ...nextByAgent.keys()]);
        for (const [agent, agentAccounts] of nextByAgent) {
            const previousAccounts = previousByAgent.get(agent);
            if (!previousAccounts || !hasSameAccounts(previousAccounts, agentAccounts)) continue;
            nextByAgent.set(agent, previousAccounts);
            changedAgents.delete(agent);
        }
        this.accounts = accounts;
        this.accountsByAgent = nextByAgent;
        if (this.config.isInitialized()) this.config.replaceAgentAccounts(accounts);
        for (const agent of changedAgents) this.dispatchEvent(new Event(agentAccountsChangedEvent(agent)));
    }

    private setStatus(accountId: string, status: AgentAccountStatus) {
        if (this.statuses.get(accountId) === status) return;
        this.statuses.set(accountId, status);
        this.dispatchEvent(new Event(agentAccountStatusChangedEvent(accountId)));
    }

    private requireBridge() {
        const bridge = this.bridgeProvider();
        if (!bridge) throw new Error('Agent account management requires the desktop app');

        return bridge;
    }
}

export const agentAccountService = new AgentAccountService();
