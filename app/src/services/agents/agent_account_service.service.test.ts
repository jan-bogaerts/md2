import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AGENT_ACCOUNTS, initialAgentAccountId, type AgentAccount } from '../../data/agent_accounts';
import type { ElectronAgentAccountBridge } from '../../data/electron_agent_account_bridge';
import { ConfigService } from '../config/config_service';
import { DialogService } from '../dialog_service';
import { AgentAccountService, agentAccountStatusChangedEvent, agentAccountsChangedEvent } from './agent_account_service';

const WORK_ACCOUNT: AgentAccount = {
    id: '0f8fad5b-d9cb-469f-a165-70867728950e',
    agent: 'codex',
    kind: 'directory',
    name: 'work',
    configDirectory: 'C:/accounts/work',
};
const CODEX_INITIAL_ID = initialAgentAccountId('codex');
const CLAUDE_INITIAL_ID = initialAgentAccountId('claude');

function createBridge(accounts: AgentAccount[]): ElectronAgentAccountBridge {
    return {
        addAgentAccount: vi.fn(async () => WORK_ACCOUNT),
        listAgentAccounts: vi.fn(async () => accounts),
        loadAgentAccountStatus: vi.fn(async () => 'available' as const),
        loginAgentAccount: vi.fn(async () => 'available' as const),
        removeAgentAccount: vi.fn(async () => undefined),
        renameAgentAccount: vi.fn(async (accountId: string, name: string) => ({ ...WORK_ACCOUNT, id: accountId, name })),
        reselectAgentAccountDirectory: vi.fn(async () => ({ ...WORK_ACCOUNT, configDirectory: 'D:/moved/work' })),
    };
}

function createService(bridge: ElectronAgentAccountBridge) {
    const dialogs = new DialogService();
    const error = vi.spyOn(dialogs, 'error');
    const config = new ConfigService();
    config.init({ desktopConfig: { agentAccounts: DEFAULT_AGENT_ACCOUNTS } });
    config.loadDraft();
    const service = new AgentAccountService(() => bridge, dialogs, config);

    return { config, error, service };
}

describe('AgentAccountService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('loads accounts per agent and the status of every account', async () => {
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT]);
        vi.mocked(bridge.loadAgentAccountStatus).mockImplementation(async (accountId) => (
            accountId === WORK_ACCOUNT.id ? 'loginRequired' : 'available'
        ));
        const { service } = createService(bridge);

        await service.load();

        expect(service.getAccounts('codex').map(({ id }) => id)).toEqual([CODEX_INITIAL_ID, WORK_ACCOUNT.id]);
        expect(service.getAccounts('claude').map(({ id }) => id)).toEqual([CLAUDE_INITIAL_ID]);
        expect(service.getStatus(WORK_ACCOUNT.id)).toBe('loginRequired');
        expect(service.getStatus(CLAUDE_INITIAL_ID)).toBe('available');
    });

    it('adds a selected account, mirrors it into the config draft, and starts its login', async () => {
        const bridge = createBridge(DEFAULT_AGENT_ACCOUNTS);
        const { config, service } = createService(bridge);
        await service.load();

        await service.addAccount('codex');

        expect(service.getAccount(WORK_ACCOUNT.id)).toEqual(WORK_ACCOUNT);
        expect(config.get('desktop.agentAccounts')).toHaveLength(DEFAULT_AGENT_ACCOUNTS.length + 1);
        expect(config.getDraft()?.['desktop.agentAccounts']).toHaveLength(DEFAULT_AGENT_ACCOUNTS.length + 1);
        expect(bridge.loginAgentAccount).toHaveBeenCalledWith(WORK_ACCOUNT.id);
        expect(service.getStatus(WORK_ACCOUNT.id)).toBe('available');
    });

    it('creates nothing when the folder picker is cancelled', async () => {
        const bridge = createBridge(DEFAULT_AGENT_ACCOUNTS);
        vi.mocked(bridge.addAgentAccount).mockResolvedValue(null);
        const { service } = createService(bridge);
        await service.load();

        await service.addAccount('codex');

        expect(service.getAccounts('codex')).toHaveLength(1);
        expect(bridge.loginAgentAccount).not.toHaveBeenCalled();
    });

    it('keeps a failed login account with a retryable status without touching other accounts', async () => {
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT]);
        const { error, service } = createService(bridge);
        await service.load();
        vi.mocked(bridge.loginAgentAccount).mockRejectedValue(new Error('spawn failed'));
        vi.mocked(bridge.loadAgentAccountStatus).mockResolvedValue('loginRequired');
        const claudeListener = vi.fn();
        service.addEventListener(agentAccountStatusChangedEvent(CLAUDE_INITIAL_ID), claudeListener);

        await service.login(WORK_ACCOUNT.id);

        expect(error).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Agent account login failed' });
        expect(service.getAccount(WORK_ACCOUNT.id)).not.toBeNull();
        expect(service.getStatus(WORK_ACCOUNT.id)).toBe('loginRequired');
        expect(service.getStatus(CLAUDE_INITIAL_ID)).toBe('available');
        expect(claudeListener).not.toHaveBeenCalled();
    });

    it('renames an account and notifies only its agent', async () => {
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT]);
        const { config, service } = createService(bridge);
        await service.load();
        const claudeAccounts = service.getAccounts('claude');
        const claudeListener = vi.fn();
        service.addEventListener(agentAccountsChangedEvent('claude'), claudeListener);

        await service.rename(WORK_ACCOUNT.id, 'Personal');

        expect(service.getAccount(WORK_ACCOUNT.id)).toMatchObject({ id: WORK_ACCOUNT.id, name: 'Personal' });
        expect(config.get('desktop.agentAccounts').find(({ id }) => id === WORK_ACCOUNT.id)?.name).toBe('Personal');
        expect(service.getAccounts('claude')).toBe(claudeAccounts);
        expect(claudeListener).not.toHaveBeenCalled();
    });

    it('keeps the account and reports the error when renaming fails', async () => {
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT]);
        vi.mocked(bridge.renameAgentAccount).mockRejectedValue(new Error('Duplicate agent account name'));
        const { error, service } = createService(bridge);
        await service.load();

        await service.rename(WORK_ACCOUNT.id, 'Default');

        expect(service.getAccount(WORK_ACCOUNT.id)?.name).toBe('work');
        expect(error).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Agent account could not be renamed' });
    });

    it('reselects a directory and refreshes the status of that account', async () => {
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT]);
        vi.mocked(bridge.loadAgentAccountStatus).mockResolvedValue('directoryUnavailable');
        const { service } = createService(bridge);
        await service.load();
        vi.mocked(bridge.loadAgentAccountStatus).mockResolvedValue('available');

        await service.reselectDirectory(WORK_ACCOUNT.id);

        expect(service.getAccount(WORK_ACCOUNT.id)).toMatchObject({ id: WORK_ACCOUNT.id, configDirectory: 'D:/moved/work' });
        expect(service.getStatus(WORK_ACCOUNT.id)).toBe('available');
    });

    it('removes an account from the service and the config', async () => {
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT]);
        const { config, service } = createService(bridge);
        await service.load();

        await service.remove(WORK_ACCOUNT.id);

        expect(service.getAccount(WORK_ACCOUNT.id)).toBeNull();
        expect(config.get('desktop.agentAccounts')).toEqual(DEFAULT_AGENT_ACCOUNTS);
        expect(config.getDraft()?.['desktop.agentAccounts']).toEqual(DEFAULT_AGENT_ACCOUNTS);
    });

    it('reports operations as unavailable without the desktop bridge', async () => {
        const dialogs = new DialogService();
        const error = vi.spyOn(dialogs, 'error');
        const service = new AgentAccountService(() => null, dialogs, new ConfigService());

        await service.load();

        expect(service.isAvailable()).toBe(false);
        expect(error).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Agent accounts could not be loaded' });
    });
});
