import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AGENT_ACCOUNT_STATUS, AgentAccountService } = require('./agent_account_service');
const { DEFAULT_AGENT_ACCOUNTS } = require('./agent_accounts.mjs');
const { saveDesktopConfig, readDesktopConfig } = require('../../shell/config');

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const WORK_DIRECTORY = 'C:/accounts/work';
const HOME_DIRECTORY = 'C:/Users/tester';
const STATUS_TIMEOUT_MS = 50;
const workAccount = { id: ACCOUNT_ID, agent: 'codex', kind: 'directory', name: 'work', configDirectory: WORK_DIRECTORY };

function createStore(storedConfig) {
    const values = new Map(storedConfig ? [['desktopConfig', storedConfig]] : []);

    return { get: (key) => values.get(key), set: (key, value) => values.set(key, value) };
}

function createChild(exitCode) {
    const child = new EventEmitter();
    child.pid = 42;
    if (exitCode !== null) setTimeout(() => child.emit('close', exitCode), 0);

    return child;
}

function createFileSystem(existingPaths) {
    const exists = (target) => existingPaths.has(path.resolve(target));
    const missing = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });

    return {
        access: vi.fn(async (target) => {
            if (!exists(target)) throw missing();
        }),
        mkdir: vi.fn(async (target) => {
            existingPaths.add(path.resolve(target));
        }),
        stat: vi.fn(async (target) => {
            if (!exists(target)) throw missing();

            return { isDirectory: () => true };
        }),
    };
}

function createService(options = {}) {
    const store = createStore();
    const initialConfig = readDesktopConfig(store, {});
    const agentAccounts = options.accounts ?? [...DEFAULT_AGENT_ACCOUNTS, workAccount];
    const agentSelection = options.agentSelection ?? initialConfig.agentSelection;
    saveDesktopConfig(store, { ...initialConfig, agentAccounts, agentSelection }, {});
    const existingPaths = new Set((options.existingPaths ?? [WORK_DIRECTORY]).map((target) => path.resolve(target)));
    const fileSystem = createFileSystem(existingPaths);
    const exitCodes = [...(options.exitCodes ?? [0])];
    const spawn = vi.fn(() => createChild(exitCodes.length > 0 ? exitCodes.shift() : 0));
    const selectFolder = vi.fn(async () => options.selectedFolder ?? null);
    const terminateProcessTree = vi.fn(async () => true);
    const service = new AgentAccountService({
        environment: { CLAUDE_CONFIG_DIR: 'C:/claude-default', Path: 'C:/tools' },
        executableResolver: { find: vi.fn(async (executable) => `C:/bin/${executable}.cmd`) },
        fileSystem,
        homeDirectory: HOME_DIRECTORY,
        loadConfig: () => readDesktopConfig(store, {}),
        platform: 'win32',
        randomUUID: () => NEW_ACCOUNT_ID,
        saveConfig: (values) => saveDesktopConfig(store, values, {}),
        selectFolder,
        spawn: options.spawn ?? spawn,
        statusTimeoutMs: STATUS_TIMEOUT_MS,
        terminateProcessTree,
    });

    return { existingPaths, fileSystem, selectFolder, service, spawn, store, terminateProcessTree };
}

describe('AgentAccountService account records', () => {
    it('creates a directory account from one selected folder with a UUID and the folder name', async () => {
        const { fileSystem, service } = createService({ selectedFolder: 'C:\\accounts\\personal' });

        const account = await service.addAccount('claude');

        expect(account).toEqual({ id: NEW_ACCOUNT_ID, agent: 'claude', kind: 'directory', name: 'personal', configDirectory: 'C:/accounts/personal' });
        expect(fileSystem.mkdir).toHaveBeenCalledWith(path.resolve('C:/accounts/personal'), { recursive: true });
        expect(service.listAccounts()).toContainEqual(account);
    });

    it('returns null and stores nothing when the folder picker is cancelled', async () => {
        const { service } = createService();

        await expect(service.addAccount('codex')).resolves.toBeNull();
        expect(service.listAccounts()).toHaveLength(3);
    });

    it('rejects a folder that another account already uses, whatever its casing', async () => {
        const { fileSystem, service } = createService({ selectedFolder: 'c:\\ACCOUNTS\\work' });

        await expect(service.addAccount('claude')).rejects.toThrow('Folder is already used by agent account "work"');
        expect(fileSystem.mkdir).not.toHaveBeenCalled();
    });

    it('adds a suffix when the derived name is already used by that agent', async () => {
        const { service } = createService({ selectedFolder: 'D:/other/work' });

        await expect(service.addAccount('codex')).resolves.toMatchObject({ name: 'work (2)' });
    });

    it('rejects accounts for agents without account support', async () => {
        const { selectFolder, service } = createService();

        await expect(service.addAccount('custom')).rejects.toThrow('Agent does not support accounts: custom');
        expect(selectFolder).not.toHaveBeenCalled();
    });

    it('renames an account without changing its identity or folder', () => {
        const { service } = createService();

        expect(service.renameAccount(ACCOUNT_ID, ' Work account ')).toEqual({ ...workAccount, name: 'Work account' });
        expect(service.renameAccount('codex-initial', 'Main')).toEqual({ id: 'codex-initial', agent: 'codex', kind: 'initial', name: 'Main' });
    });

    it('reselects only the directory of a directory account and keeps its ID', async () => {
        const { service } = createService({ selectedFolder: 'D:/moved/work' });

        await expect(service.reselectDirectory(ACCOUNT_ID)).resolves.toEqual({ ...workAccount, configDirectory: 'D:/moved/work' });
        await expect(service.reselectDirectory('codex-initial')).rejects.toThrow('initial agent account cannot be removed or assigned a directory');
    });

    it('allows reselecting the folder the account already uses', async () => {
        const { service } = createService({ selectedFolder: WORK_DIRECTORY });

        await expect(service.reselectDirectory(ACCOUNT_ID)).resolves.toEqual(workAccount);
    });

    it('removes only the configuration record and resets a remembered selection to the initial account', () => {
        const store = createStore();
        const { agentSelection } = readDesktopConfig(store, {});
        const codexSettings = { ...agentSelection.settingsByAgent.codex, accountId: ACCOUNT_ID };
        const selection = { ...agentSelection, settingsByAgent: { ...agentSelection.settingsByAgent, codex: codexSettings } };
        const { fileSystem, service, store: serviceStore } = createService({ agentSelection: selection });

        service.removeAccount(ACCOUNT_ID);

        const config = readDesktopConfig(serviceStore, {});
        expect(config.agentAccounts.map(({ id }) => id)).toEqual(['codex-initial', 'claude-initial']);
        expect(config.agentSelection.settingsByAgent.codex).not.toHaveProperty('accountId');
        expect(fileSystem.mkdir).not.toHaveBeenCalled();
    });

    it('refuses to remove the initial account', () => {
        const { service } = createService();

        expect(() => service.removeAccount('claude-initial')).toThrow('initial agent account cannot be removed');
    });
});

describe('AgentAccountService login', () => {
    it('runs a visible Codex login with only CODEX_HOME overridden and file credential storage', async () => {
        const { service, spawn } = createService({ exitCodes: [0, 0], existingPaths: [WORK_DIRECTORY, `${WORK_DIRECTORY}/auth.json`] });

        await expect(service.login(ACCOUNT_ID)).resolves.toBe(AGENT_ACCOUNT_STATUS.available);

        expect(spawn).toHaveBeenNthCalledWith(1, 'C:/bin/codex.cmd', ['login', '-c', 'cli_auth_credentials_store=file'], {
            cwd: HOME_DIRECTORY,
            detached: true,
            env: { CLAUDE_CONFIG_DIR: 'C:/claude-default', CODEX_HOME: path.resolve(WORK_DIRECTORY), Path: 'C:/tools' },
            stdio: 'ignore',
            windowsHide: false,
        });
        expect(spawn).toHaveBeenNthCalledWith(2, 'C:/bin/codex.cmd', ['login', 'status', '-c', 'cli_auth_credentials_store=file'], expect.objectContaining({
            stdio: 'ignore',
            windowsHide: true,
        }));
    });

    it('starts Claude with /login and only CLAUDE_CONFIG_DIR overridden', async () => {
        const claudeAccount = { id: ACCOUNT_ID, agent: 'claude', kind: 'directory', name: 'work', configDirectory: WORK_DIRECTORY };
        const { service, spawn } = createService({ accounts: [...DEFAULT_AGENT_ACCOUNTS, claudeAccount], exitCodes: [0, 0] });

        await expect(service.login(ACCOUNT_ID)).resolves.toBe(AGENT_ACCOUNT_STATUS.available);

        const [executable, argumentsList, options] = spawn.mock.calls[0];
        expect(executable).toBe('C:/bin/claude.cmd');
        expect(argumentsList).toEqual(['/login']);
        expect(options.env).toEqual({ CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: '1', CLAUDE_CONFIG_DIR: path.resolve(WORK_DIRECTORY), Path: 'C:/tools' });
        expect(spawn.mock.calls[1][1]).toEqual(['auth', 'status']);
    });

    it('logs in the initial account with the inherited environment', async () => {
        const { service, spawn } = createService({ exitCodes: [0, 0] });

        await expect(service.login('codex-initial')).resolves.toBe(AGENT_ACCOUNT_STATUS.available);

        expect(spawn.mock.calls[0][1]).toEqual(['login']);
        expect(spawn.mock.calls[0][2].env).toEqual({ CLAUDE_CONFIG_DIR: 'C:/claude-default', Path: 'C:/tools' });
        expect(spawn.mock.calls[1][1]).toEqual(['login', 'status']);
    });

    it('keeps a cancelled or failed login as a retryable login-required account', async () => {
        const { service } = createService({ exitCodes: [1, 1] });

        await expect(service.login(ACCOUNT_ID)).resolves.toBe(AGENT_ACCOUNT_STATUS.loginRequired);
        expect(service.listAccounts()).toContainEqual(workAccount);
    });

    it('reports a login in progress and rejects a second login for the same account', async () => {
        const loginChild = createChild(null);
        const spawn = vi.fn()
            .mockReturnValueOnce(loginChild)
            .mockImplementation(() => createChild(1));
        const { service } = createService({ spawn });

        const login = service.login(ACCOUNT_ID);
        await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(1));

        await expect(service.loadStatus(ACCOUNT_ID)).resolves.toBe(AGENT_ACCOUNT_STATUS.loginInProgress);
        await expect(service.login(ACCOUNT_ID)).rejects.toThrow('login is already running');
        expect(() => service.removeAccount(ACCOUNT_ID)).toThrow('login is already running');
        loginChild.emit('close', 1);
        await expect(login).resolves.toBe(AGENT_ACCOUNT_STATUS.loginRequired);
    });

    it('rejects a login when the account folder is missing', async () => {
        const { service, spawn } = createService({ existingPaths: [] });

        await expect(service.login(ACCOUNT_ID)).rejects.toThrow('Agent account directory is unavailable');
        expect(spawn).not.toHaveBeenCalled();
    });

    it('closes open login windows on stop', async () => {
        const loginChild = createChild(null);
        const { service, terminateProcessTree } = createService({ spawn: vi.fn(() => loginChild) });

        void service.login(ACCOUNT_ID);
        await vi.waitFor(() => expect(service.logins.size).toBe(1));
        await service.stop();

        expect(terminateProcessTree).toHaveBeenCalledWith(loginChild);
    });
});

describe('AgentAccountService status', () => {
    it('reports an available account from the provider status exit code', async () => {
        const { service } = createService({ existingPaths: [WORK_DIRECTORY, `${WORK_DIRECTORY}/auth.json`] });

        await expect(service.loadStatus(ACCOUNT_ID)).resolves.toBe(AGENT_ACCOUNT_STATUS.available);
    });

    it('reports a Codex account whose credentials are not in its folder as not isolated', async () => {
        const { service } = createService();

        await expect(service.loadStatus(ACCOUNT_ID)).resolves.toBe(AGENT_ACCOUNT_STATUS.notIsolated);
    });

    it('reports a missing folder only for its own account', async () => {
        const otherAccount = { ...workAccount, id: NEW_ACCOUNT_ID, name: 'other', configDirectory: 'C:/accounts/other' };
        const { service, spawn } = createService({
            accounts: [...DEFAULT_AGENT_ACCOUNTS, workAccount, otherAccount],
            existingPaths: ['C:/accounts/other', 'C:/accounts/other/auth.json'],
        });

        await expect(service.loadStatus(ACCOUNT_ID)).resolves.toBe(AGENT_ACCOUNT_STATUS.directoryUnavailable);
        await expect(service.loadStatus(NEW_ACCOUNT_ID)).resolves.toBe(AGENT_ACCOUNT_STATUS.available);
        expect(spawn).toHaveBeenCalledTimes(1);
    });

    it('terminates a status check that does not finish and reports login required', async () => {
        const statusChild = createChild(null);
        const { service, terminateProcessTree } = createService({ spawn: vi.fn(() => statusChild) });
        terminateProcessTree.mockImplementation(async (child) => {
            child.emit('close', null);

            return true;
        });

        await expect(service.loadStatus(ACCOUNT_ID)).resolves.toBe(AGENT_ACCOUNT_STATUS.loginRequired);
        expect(terminateProcessTree).toHaveBeenCalledWith(statusChild);
    });

    it('fails clearly when the provider CLI cannot be started', async () => {
        const failingChild = new EventEmitter();
        setTimeout(() => failingChild.emit('error', new Error('spawn ENOENT')), 0);
        const { service } = createService({ spawn: vi.fn(() => failingChild) });

        await expect(service.loadStatus('codex-initial')).rejects.toThrow('Agent account process failed: spawn ENOENT');
    });
});
