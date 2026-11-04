import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AGENT_ACCOUNTS, initialAgentAccountId, type AgentAccount } from '../../data/agent_accounts';
import type { DesktopAgentAccountStatus, ElectronAgentAccountBridge } from '../../data/electron_agent_account_bridge';
import { configService } from '../../services/config/config_service';
import { dialogService } from '../../services/dialog_service';
import { AppThemeProvider } from '../../theme/theme_provider';
import { AgentAccountsEditor } from './agent_accounts_editor';

const WORK_ACCOUNT: AgentAccount = {
    id: '0f8fad5b-d9cb-469f-a165-70867728950e',
    agent: 'codex',
    kind: 'directory',
    name: 'work',
    configDirectory: 'C:/accounts/work',
};
const CLAUDE_ACCOUNT: AgentAccount = {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    agent: 'claude',
    kind: 'directory',
    name: 'personal',
    configDirectory: 'C:/accounts/personal',
};

function createBridge(accounts: AgentAccount[], statuses: Record<string, DesktopAgentAccountStatus> = {}): ElectronAgentAccountBridge {
    return {
        addAgentAccount: vi.fn(async () => null),
        listAgentAccounts: vi.fn(async () => accounts),
        loadAgentAccountStatus: vi.fn(async (accountId: string) => statuses[accountId] ?? 'available'),
        loginAgentAccount: vi.fn(async () => 'available' as const),
        removeAgentAccount: vi.fn(async () => undefined),
        renameAgentAccount: vi.fn(async (accountId: string, name: string) => ({ ...WORK_ACCOUNT, id: accountId, name })),
        reselectAgentAccountDirectory: vi.fn(async () => null),
    };
}

function renderEditor(bridge: ElectronAgentAccountBridge) {
    window.md2AgentAccounts = bridge;
    render(
        <AppThemeProvider>
            <AgentAccountsEditor disabled={false} />
        </AppThemeProvider>,
    );
}

function providerSection(name: string) {
    return screen.getByRole('region', { name });
}

async function findRow(section: HTMLElement, accountName: string) {
    const field = await within(section).findByDisplayValue(accountName);
    const row = field.closest('.MuiBox-root');
    if (!(row instanceof HTMLElement)) throw new Error(`Row not found for ${accountName}`);

    return row;
}

describe('AgentAccountsEditor', () => {
    beforeEach(() => {
        configService.init({ desktopConfig: { agentAccounts: DEFAULT_AGENT_ACCOUNTS } });
        vi.spyOn(dialogService, 'error');
    });

    afterEach(() => {
        cleanup();
        delete window.md2AgentAccounts;
        configService.clear();
        vi.restoreAllMocks();
    });

    it('lists initial and directory accounts separately per provider', async () => {
        renderEditor(createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT, CLAUDE_ACCOUNT]));

        const codex = providerSection('Codex');
        const claude = providerSection('Claude');
        const codexNames = await within(codex).findAllByRole('textbox', { name: 'Account name' });
        expect(codexNames.map((field) => (field as HTMLInputElement).value)).toEqual(['Default', 'work']);
        expect(within(codex).getByText('Initial')).toBeInTheDocument();
        expect(within(codex).getByText('C:/accounts/work')).toBeInTheDocument();
        expect(await within(claude).findByDisplayValue('personal')).toBeInTheDocument();
        expect(within(claude).queryByText('C:/accounts/work')).not.toBeInTheDocument();
        await waitFor(() => expect(within(codex).getAllByText('Signed in')).toHaveLength(2));
    });

    it('offers no folder or removal actions for the initial account', async () => {
        renderEditor(createBridge(DEFAULT_AGENT_ACCOUNTS, { [initialAgentAccountId('codex')]: 'directoryUnavailable' }));

        const row = await findRow(providerSection('Codex'), 'Default');

        expect(within(row).queryByRole('button', { name: /Remove account/u })).not.toBeInTheDocument();
        expect(within(row).queryByRole('button', { name: 'Choose folder' })).not.toBeInTheDocument();
    });

    it('adds a selected folder as an account and starts its login', async () => {
        const user = userEvent.setup();
        const bridge = createBridge(DEFAULT_AGENT_ACCOUNTS);
        vi.mocked(bridge.addAgentAccount).mockResolvedValue(WORK_ACCOUNT);
        renderEditor(bridge);
        const codex = providerSection('Codex');
        await within(codex).findByDisplayValue('Default');

        await user.click(within(codex).getByRole('button', { name: 'Add account' }));

        expect(await within(codex).findByDisplayValue('work')).toBeInTheDocument();
        expect(bridge.addAgentAccount).toHaveBeenCalledWith('codex');
        await waitFor(() => expect(bridge.loginAgentAccount).toHaveBeenCalledWith(WORK_ACCOUNT.id));
    });

    it('creates nothing when the folder picker is cancelled', async () => {
        const user = userEvent.setup();
        const bridge = createBridge(DEFAULT_AGENT_ACCOUNTS);
        renderEditor(bridge);
        const codex = providerSection('Codex');
        await within(codex).findByDisplayValue('Default');

        await user.click(within(codex).getByRole('button', { name: 'Add account' }));

        await waitFor(() => expect(bridge.addAgentAccount).toHaveBeenCalled());
        expect(within(codex).getAllByRole('textbox', { name: 'Account name' })).toHaveLength(1);
        expect(bridge.loginAgentAccount).not.toHaveBeenCalled();
    });

    it('keeps a row with a retry action after a cancelled login without affecting other providers', async () => {
        const user = userEvent.setup();
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT]);
        vi.mocked(bridge.addAgentAccount).mockResolvedValue(WORK_ACCOUNT);
        vi.mocked(bridge.loginAgentAccount).mockResolvedValue('loginRequired');
        renderEditor(bridge);
        const workRow = await findRow(providerSection('Codex'), 'work');
        const claudeRow = await findRow(providerSection('Claude'), 'Default');
        await within(workRow).findByRole('button', { name: 'Reauthenticate' });

        await user.click(within(workRow).getByRole('button', { name: 'Reauthenticate' }));

        expect(await within(workRow).findByText('Login required')).toBeInTheDocument();
        await user.click(within(workRow).getByRole('button', { name: 'Log in' }));
        expect(bridge.loginAgentAccount).toHaveBeenCalledTimes(2);
        expect(within(claudeRow).getByText('Signed in')).toBeInTheDocument();
        expect(within(claudeRow).getByRole('button', { name: 'Reauthenticate' })).toBeEnabled();
    });

    it('renames an account without changing its ID', async () => {
        const user = userEvent.setup();
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT]);
        renderEditor(bridge);
        const field = await within(providerSection('Codex')).findByDisplayValue('work');

        await user.clear(field);
        await user.type(field, 'Client{Enter}');

        await waitFor(() => expect(bridge.renameAgentAccount).toHaveBeenCalledWith(WORK_ACCOUNT.id, 'Client'));
        expect(bridge.renameAgentAccount).toHaveBeenCalledTimes(1);
        expect(await within(providerSection('Codex')).findByDisplayValue('Client')).toBeInTheDocument();
    });

    it('restores the stored name when renaming fails', async () => {
        const user = userEvent.setup();
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT]);
        vi.mocked(bridge.renameAgentAccount).mockRejectedValue(new Error('Duplicate agent account name'));
        renderEditor(bridge);
        const field = await within(providerSection('Codex')).findByDisplayValue('work');

        await user.clear(field);
        await user.type(field, 'Default{Enter}');

        await waitFor(() => expect(field).toHaveValue('work'));
        expect(dialogService.error).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Agent account could not be renamed' });
    });

    it('reselects a missing folder for a directory account', async () => {
        const user = userEvent.setup();
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT], { [WORK_ACCOUNT.id]: 'directoryUnavailable' });
        const moved = { ...WORK_ACCOUNT, configDirectory: 'D:/moved/work' };
        vi.mocked(bridge.reselectAgentAccountDirectory).mockResolvedValue(moved);
        renderEditor(bridge);
        const row = await findRow(providerSection('Codex'), 'work');
        const chooseFolder = await within(row).findByRole('button', { name: 'Choose folder' });
        expect(within(row).getByRole('button', { name: 'Log in' })).toBeDisabled();
        vi.mocked(bridge.loadAgentAccountStatus).mockResolvedValue('available');

        await user.click(chooseFolder);

        expect(await within(row).findByText('D:/moved/work')).toBeInTheDocument();
        expect(await within(row).findByText('Signed in')).toBeInTheDocument();
        expect(within(row).queryByRole('button', { name: 'Choose folder' })).not.toBeInTheDocument();
    });

    it('removes a directory account only after confirmation', async () => {
        const user = userEvent.setup();
        const bridge = createBridge([...DEFAULT_AGENT_ACCOUNTS, WORK_ACCOUNT]);
        renderEditor(bridge);
        const codex = providerSection('Codex');
        await within(codex).findByDisplayValue('work');

        await user.click(within(codex).getByRole('button', { name: 'Remove account work' }));
        const dialog = await screen.findByRole('dialog', { name: 'Remove account?' });
        expect(dialog).toHaveTextContent('The folder C:/accounts/work and the credentials in it stay on disk.');
        await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(bridge.removeAgentAccount).not.toHaveBeenCalled();

        await user.click(within(codex).getByRole('button', { name: 'Remove account work' }));
        await user.click(within(await screen.findByRole('dialog', { name: 'Remove account?' })).getByRole('button', { name: 'Remove' }));

        await waitFor(() => expect(within(codex).queryByDisplayValue('work')).not.toBeInTheDocument());
        expect(bridge.removeAgentAccount).toHaveBeenCalledWith(WORK_ACCOUNT.id);
    });

    it('explains that account management needs the desktop app', () => {
        render(
            <AppThemeProvider>
                <AgentAccountsEditor disabled={false} />
            </AppThemeProvider>,
        );

        expect(screen.getByText('Account management requires the desktop app.')).toBeInTheDocument();
    });
});
