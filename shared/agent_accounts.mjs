import { normalizePath } from './path_utils.mjs';

export const ACCOUNT_AGENTS = ['codex', 'claude'];
export const INITIAL_ACCOUNT_KIND = 'initial';
export const DIRECTORY_ACCOUNT_KIND = 'directory';
const INITIAL_ACCOUNT_NAME = 'Default';
const INITIAL_ACCOUNT_ID_SUFFIX = '-initial';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^(?:[A-Za-z]:\/|\/\/[^/])/u;
const TRAILING_SEPARATOR_PATTERN = /\/+$/u;

/** Reserved ID of the account that uses the CLI login of the inherited environment. */
export function initialAgentAccountId(agent) {
    return `${agent}${INITIAL_ACCOUNT_ID_SUFFIX}`;
}

export function supportsAgentAccounts(agent) {
    return ACCOUNT_AGENTS.includes(agent);
}

export const DEFAULT_AGENT_ACCOUNTS = ACCOUNT_AGENTS.map((agent) => (
    { id: initialAgentAccountId(agent), agent, kind: INITIAL_ACCOUNT_KIND, name: INITIAL_ACCOUNT_NAME }
));

function requireAccountString(value, fieldName) {
    if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Invalid agent account field: ${fieldName}`);

    return value;
}

function isWindowsPath(directory) {
    return WINDOWS_ABSOLUTE_PATH_PATTERN.test(directory);
}

function normalizeConfigDirectory(value, fieldName) {
    const directory = normalizePath(requireAccountString(value, fieldName));
    const isAbsolute = isWindowsPath(directory) || directory.startsWith('/');
    if (!isAbsolute) throw new Error(`Agent account directory must be absolute: ${fieldName}`);
    const trimmed = directory.replace(TRAILING_SEPARATOR_PATTERN, '');

    return trimmed.length === 0 || trimmed.endsWith(':') ? `${trimmed}/` : trimmed;
}

/** Comparison key for directory uniqueness: Windows paths are case-insensitive, POSIX paths are not. */
function directoryComparisonKey(directory) {
    return isWindowsPath(directory) ? directory.toLowerCase() : directory;
}

function validateAgentAccount(value, source) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid agent account: ${source}`);
    const id = requireAccountString(value.id, `${source}.id`);
    const agent = requireAccountString(value.agent, `${source}.agent`);
    if (!supportsAgentAccounts(agent)) throw new Error(`Agent does not support accounts in ${source}: ${agent}`);
    const name = requireAccountString(value.name, `${source}.name`);
    if (value.kind === INITIAL_ACCOUNT_KIND) {
        if (id !== initialAgentAccountId(agent)) throw new Error(`Invalid initial agent account ID in ${source}: ${id}`);
        if (value.configDirectory !== undefined) throw new Error(`Initial agent account cannot have a directory: ${source}`);

        return { id, agent, kind: INITIAL_ACCOUNT_KIND, name };
    }
    if (value.kind !== DIRECTORY_ACCOUNT_KIND) throw new Error(`Invalid agent account kind in ${source}: ${String(value.kind)}`);
    if (!UUID_PATTERN.test(id)) throw new Error(`Agent account ID must be a UUID in ${source}: ${id}`);
    const configDirectory = normalizeConfigDirectory(value.configDirectory, `${source}.configDirectory`);

    return { id, agent, kind: DIRECTORY_ACCOUNT_KIND, name, configDirectory };
}

function requireUniqueValues(keys, label, source) {
    const seen = new Set();
    for (const key of keys) {
        if (seen.has(key)) throw new Error(`Duplicate agent account ${label} in ${source}: ${key}`);
        seen.add(key);
    }
}

/** Validates the full account collection, including uniqueness and one initial account per supported agent. */
export function validateAgentAccounts(value, source) {
    if (!Array.isArray(value)) throw new Error(`Invalid agent accounts in ${source}`);
    const accounts = value.map((account, index) => validateAgentAccount(account, `${source}[${index}]`));
    requireUniqueValues(accounts.map(({ id }) => id), 'ID', source);
    requireUniqueValues(accounts.map(({ agent, name }) => `${agent}/${name}`), 'name', source);
    const directories = accounts.filter(({ kind }) => kind === DIRECTORY_ACCOUNT_KIND)
        .map(({ configDirectory }) => directoryComparisonKey(configDirectory));
    requireUniqueValues(directories, 'directory', source);
    for (const agent of ACCOUNT_AGENTS) {
        const hasInitial = accounts.some((account) => account.agent === agent && account.kind === INITIAL_ACCOUNT_KIND);
        if (!hasInitial) throw new Error(`Missing initial agent account for ${agent} in ${source}`);
    }

    return accounts;
}

/** A missing collection resolves to the initial accounts without persisting them. */
export function resolveAgentAccounts(value, source) {
    if (value === undefined) return structuredClone(DEFAULT_AGENT_ACCOUNTS);

    return validateAgentAccounts(value, source);
}

export function findAgentAccount(accounts, accountId) {
    return accounts.find(({ id }) => id === accountId) ?? null;
}

/**
 * Resolves the account for an agent. A removed account falls back to the configured default and
 * then the initial account. An account owned by another agent remains an error.
 */
export function resolveAgentAccount(accounts, agent, accountId, defaultAccountId) {
    if (!supportsAgentAccounts(agent)) {
        if (accountId !== undefined) throw new Error(`Agent profile does not support accounts: ${agent}`);

        return null;
    }
    const candidateIds = [...new Set([
        accountId,
        defaultAccountId,
        initialAgentAccountId(agent),
    ].filter((candidateId) => candidateId !== undefined))];
    for (const candidateId of candidateIds) {
        const account = findAgentAccount(accounts, candidateId);
        if (!account) continue;
        if (account.agent !== agent) {
            throw new Error(`Agent account ${candidateId} belongs to ${account.agent}, not ${agent}`);
        }

        return account;
    }

    throw new Error(`Missing initial agent account for ${agent}`);
}
