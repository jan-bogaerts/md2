const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const crossSpawn = require('cross-spawn');
const { findAgentProfile } = require('../../../../shared/agent_profiles.mjs');
const { normalizePath } = require('../../../../shared/path_utils.mjs');
const { DIRECTORY_ACCOUNT_KIND, findAgentAccount, supportsAgentAccounts } = require('./agent_accounts.mjs');
const { createAgentAccountEnvironment } = require('./agent_account_environment');
const { terminateProcessTree } = require('../process_tree');

const AGENT_ACCOUNT_STATUS = Object.freeze({
    available: 'available',
    directoryUnavailable: 'directoryUnavailable',
    loginInProgress: 'loginInProgress',
    loginRequired: 'loginRequired',
    notIsolated: 'notIsolated',
});
// Codex may otherwise keep credentials in the shared OS credential store, which defeats directory isolation.
const CODEX_FILE_CREDENTIAL_STORE_ARGUMENTS = ['-c', 'cli_auth_credentials_store=file'];
const CODEX_CREDENTIAL_FILE_NAME = 'auth.json';
const CLAUDE_LOGIN_PROMPT = '/login';
const STATUS_CHECK_TIMEOUT_MS = 30000;
const SUCCESS_EXIT_CODE = 0;
const FIRST_NAME_SUFFIX = 2;

/** Only metadata may cross IPC: never credential contents, usernames, or tokens. */
function toAccountMetadata(account) {
    const { id, agent, kind, name } = account;
    if (kind !== DIRECTORY_ACCOUNT_KIND) return { id, agent, kind, name };

    return { id, agent, kind, name, configDirectory: account.configDirectory };
}

/** Windows paths are case-insensitive, so two spellings of one folder must compare equal. */
function directoryComparisonKey(directory, platform) {
    const normalized = normalizePath(path.resolve(directory));

    return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function buildLoginArguments(account) {
    if (account.agent === 'claude') return [CLAUDE_LOGIN_PROMPT];
    const storeArguments = account.kind === DIRECTORY_ACCOUNT_KIND ? CODEX_FILE_CREDENTIAL_STORE_ARGUMENTS : [];

    return ['login', ...storeArguments];
}

function buildStatusArguments(account) {
    if (account.agent === 'claude') return ['auth', 'status'];
    const storeArguments = account.kind === DIRECTORY_ACCOUNT_KIND ? CODEX_FILE_CREDENTIAL_STORE_ARGUMENTS : [];

    return ['login', 'status', ...storeArguments];
}

/** Derives a display name from the folder name that is unique among the agent's accounts. */
function deriveAccountName(accounts, agent, directory) {
    const baseName = path.basename(directory);
    const takenNames = new Set(accounts.filter((account) => account.agent === agent).map(({ name }) => name));
    if (!takenNames.has(baseName)) return baseName;
    const lastSuffix = takenNames.size + FIRST_NAME_SUFFIX;
    for (let suffix = FIRST_NAME_SUFFIX; suffix <= lastSuffix; suffix += 1) {
        const candidate = `${baseName} (${suffix})`;
        if (!takenNames.has(candidate)) return candidate;
    }

    throw new Error(`Could not derive a unique account name for folder: ${baseName}`);
}

/** A removed account must not stay the remembered selection; a missing account ID resolves to the initial account. */
function clearRemovedAccountSelection(agentSelection, accountId) {
    const settingsByAgent = Object.fromEntries(Object.entries(agentSelection.settingsByAgent).map(([agent, settings]) => {
        if (settings.accountId !== accountId) return [agent, settings];
        const remainingSettings = Object.fromEntries(Object.entries(settings).filter(([field]) => field !== 'accountId'));

        return [agent, remainingSettings];
    }));

    return { ...agentSelection, settingsByAgent };
}

function requireAccount(config, accountId) {
    const account = findAgentAccount(config.agentAccounts, accountId);
    if (!account) throw new Error(`Unknown agent account: ${String(accountId)}`);

    return account;
}

function requireDirectoryAccount(config, accountId) {
    const account = requireAccount(config, accountId);
    if (account.kind !== DIRECTORY_ACCOUNT_KIND) throw new Error(`The initial agent account cannot be removed or assigned a directory: ${accountId}`);

    return account;
}

/**
 * Owns agent account directories, the provider login process lifecycle, and login status checks.
 * Credentials stay in the provider-owned directories; this service only reads metadata and exit codes.
 */
class AgentAccountService {
    constructor(dependencies) {
        const { executableResolver, loadConfig, saveConfig, selectFolder } = dependencies;
        if (!executableResolver || !loadConfig || !saveConfig || !selectFolder) throw new Error('Missing agent account service dependencies');
        this.environment = dependencies.environment ?? process.env;
        this.executableResolver = executableResolver;
        this.fileSystem = dependencies.fileSystem ?? fs.promises;
        this.homeDirectory = dependencies.homeDirectory ?? os.homedir();
        this.loadConfig = loadConfig;
        this.platform = dependencies.platform ?? process.platform;
        this.randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());
        this.saveConfig = saveConfig;
        this.selectFolder = selectFolder;
        this.spawn = dependencies.spawn ?? crossSpawn;
        this.statusTimeoutMs = dependencies.statusTimeoutMs ?? STATUS_CHECK_TIMEOUT_MS;
        this.terminate = dependencies.terminateProcessTree ?? terminateProcessTree;
        this.logins = new Map();
    }

    listAccounts() {
        return this.loadConfig().agentAccounts.map(toAccountMetadata);
    }

    /** Lets the user pick one folder, creates it when needed, and stores a new directory account for it. */
    async addAccount(agent) {
        if (!supportsAgentAccounts(agent)) throw new Error(`Agent does not support accounts: ${String(agent)}`);
        const directory = await this.selectAccountDirectory(null);
        if (!directory) return null;
        const config = this.loadConfig();
        const configDirectory = normalizePath(directory);
        const name = deriveAccountName(config.agentAccounts, agent, directory);
        const account = { id: this.randomUUID(), agent, kind: DIRECTORY_ACCOUNT_KIND, name, configDirectory };
        this.saveConfig({ ...config, agentAccounts: [...config.agentAccounts, account] });

        return toAccountMetadata(account);
    }

    renameAccount(accountId, name) {
        if (typeof name !== 'string' || name.trim().length === 0) throw new Error('Agent account name must not be empty');
        const config = this.loadConfig();
        const account = requireAccount(config, accountId);
        const renamed = { ...account, name: name.trim() };
        const agentAccounts = config.agentAccounts.map((candidate) => (candidate.id === accountId ? renamed : candidate));
        this.saveConfig({ ...config, agentAccounts });

        return toAccountMetadata(renamed);
    }

    /** Points a directory account at another folder; the account ID stays and no credentials are copied. */
    async reselectDirectory(accountId) {
        const account = requireDirectoryAccount(this.loadConfig(), accountId);
        this.requireNoLogin(accountId);
        const directory = await this.selectAccountDirectory(accountId);
        if (!directory) return null;
        const config = this.loadConfig();
        const reselected = { ...account, configDirectory: normalizePath(directory) };
        const agentAccounts = config.agentAccounts.map((candidate) => (candidate.id === accountId ? reselected : candidate));
        this.saveConfig({ ...config, agentAccounts });

        return toAccountMetadata(reselected);
    }

    /** Removes only the configuration record; the account folder and its credentials stay on disk. */
    removeAccount(accountId) {
        const config = this.loadConfig();
        requireDirectoryAccount(config, accountId);
        this.requireNoLogin(accountId);
        const agentAccounts = config.agentAccounts.filter(({ id }) => id !== accountId);
        const agentSelection = clearRemovedAccountSelection(config.agentSelection, accountId);
        this.saveConfig({ ...config, agentAccounts, agentSelection });
    }

    async loadStatus(accountId) {
        const account = requireAccount(this.loadConfig(), accountId);
        if (this.logins.has(accountId)) return AGENT_ACCOUNT_STATUS.loginInProgress;

        return this.checkStatus(account);
    }

    /** Runs the provider-owned login in a visible window and reports the status once that window closes. */
    async login(accountId) {
        const config = this.loadConfig();
        const account = requireAccount(config, accountId);
        this.requireNoLogin(accountId);
        if (!(await this.isDirectoryAvailable(account))) throw new Error(`Agent account directory is unavailable: ${account.configDirectory}`);
        const { argumentsList, environment, executable } = await this.resolveCommand(config, account, buildLoginArguments(account));
        const child = this.spawn(executable, argumentsList, {
            cwd: this.homeDirectory,
            detached: true,
            env: environment,
            stdio: 'ignore',
            windowsHide: false,
        });
        this.logins.set(accountId, child);
        try {
            await this.waitForExit(child, null);
        } finally {
            this.logins.delete(accountId);
        }

        // Cancelled and failed logins are not errors: the status check reports the account as requiring login.
        return this.checkStatus(account);
    }

    /** Closes login windows that are still open, for application shutdown. */
    async stop() {
        const children = [...this.logins.values()];
        this.logins.clear();
        await Promise.all(children.map((child) => this.terminate(child)));
    }

    async checkStatus(account) {
        if (!(await this.isDirectoryAvailable(account))) return AGENT_ACCOUNT_STATUS.directoryUnavailable;
        const statusArguments = buildStatusArguments(account);
        const { argumentsList, environment, executable } = await this.resolveCommand(this.loadConfig(), account, statusArguments);
        const child = this.spawn(executable, argumentsList, {
            cwd: this.homeDirectory,
            env: environment,
            // Status output can include the signed-in identity; only the exit code is used.
            stdio: 'ignore',
            windowsHide: true,
        });
        const exitCode = await this.waitForExit(child, this.statusTimeoutMs);
        if (exitCode !== SUCCESS_EXIT_CODE) return AGENT_ACCOUNT_STATUS.loginRequired;
        if (account.agent === 'codex' && account.kind === DIRECTORY_ACCOUNT_KIND) {
            const credentialFile = path.join(path.resolve(account.configDirectory), CODEX_CREDENTIAL_FILE_NAME);
            if (!(await this.pathExists(credentialFile))) return AGENT_ACCOUNT_STATUS.notIsolated;
        }

        return AGENT_ACCOUNT_STATUS.available;
    }

    async resolveCommand(config, account, providerArguments) {
        const profile = findAgentProfile(config.agentProfiles, account.agent);
        if (!profile) throw new Error(`Unknown agent profile: ${account.agent}`);
        const [configuredExecutable, ...configuredArguments] = profile.command;
        const environment = createAgentAccountEnvironment(this.environment, account);
        const executable = await this.executableResolver.find(configuredExecutable, { cwd: this.homeDirectory, env: environment });
        if (!executable) throw new Error(`Executable not found for ${account.agent}: ${configuredExecutable}`);

        return { argumentsList: [...configuredArguments, ...providerArguments], environment, executable };
    }

    /** Resolves with the exit code; a status check that outlives its timeout is terminated and treated as failed. */
    waitForExit(child, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timeout = timeoutMs === null ? null : setTimeout(() => {
                void this.terminate(child).catch((error) => console.error('Agent account status check could not be stopped', error));
            }, timeoutMs);
            child.on('error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`Agent account process failed: ${error.message}`, { cause: error }));
            });
            child.on('close', (exitCode) => {
                clearTimeout(timeout);
                resolve(exitCode ?? 1);
            });
        });
    }

    /** Opens the folder picker, rejects a folder owned by another account, and creates the folder when needed. */
    async selectAccountDirectory(accountId) {
        const selected = await this.selectFolder();
        if (!selected) return null;
        const directory = path.resolve(selected);
        const key = directoryComparisonKey(directory, this.platform);
        const owner = this.loadConfig().agentAccounts.find((account) => (
            account.kind === DIRECTORY_ACCOUNT_KIND
            && account.id !== accountId
            && directoryComparisonKey(account.configDirectory, this.platform) === key
        ));
        if (owner) throw new Error(`Folder is already used by agent account "${owner.name}": ${directory}`);
        await this.fileSystem.mkdir(directory, { recursive: true });

        return directory;
    }

    async isDirectoryAvailable(account) {
        if (account.kind !== DIRECTORY_ACCOUNT_KIND) return true;
        try {
            const directory = path.resolve(account.configDirectory);
            const stats = await this.fileSystem.stat(directory);
            if (!stats.isDirectory()) return false;
            await this.fileSystem.access(directory, fs.constants.R_OK | fs.constants.W_OK);

            return true;
        } catch {
            // A missing or unreadable folder is the reported account status, not a service failure.
            return false;
        }
    }

    async pathExists(filePath) {
        try {
            await this.fileSystem.access(filePath, fs.constants.F_OK);

            return true;
        } catch {
            return false;
        }
    }

    requireNoLogin(accountId) {
        if (this.logins.has(accountId)) throw new Error(`Agent account login is already running: ${accountId}`);
    }
}

module.exports = { AGENT_ACCOUNT_STATUS, AgentAccountService };
