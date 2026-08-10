const DEFAULT_DESKTOP_AGENT = 'codex';
const DEFAULT_DESKTOP_PERMISSION_MODE = 'ask-for-approval';
const DEFAULT_DESKTOP_MODEL = '';
const DEFAULT_DESKTOP_THINKING_LEVEL = 'none';
const DEFAULT_CODEX_SEARCH_ENABLED = true;
const DEFAULT_EDITOR_COMMAND = 'code -g "{{file}}:{{line}}"';
const DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND = '';
const DESKTOP_CONFIG_STORE_KEY = 'desktopConfig';
const {
    BUILTIN_AGENT_PROFILES,
    normalizeAgentProfiles,
    validateAgentProfiles,
    validatePermissionMode,
    validateThinkingLevel,
} = require('../actions/agent/agent_profiles.mjs');

function requireString(value, fieldName, allowEmpty = false) {
    if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
        throw new Error(`Missing config field: desktop.${fieldName}`);
    }

    return value;
}

function validateDesktopConfig(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Missing desktop config');
    const editorCommand = requireString(values.editorCommand, 'editorCommand');
    if (!editorCommand.includes('{{file}}')) throw new Error('Config field desktop.editorCommand requires {{file}} placeholder');
    const mergeConflictResolverCommand = requireString(values.mergeConflictResolverCommand, 'mergeConflictResolverCommand', true);
    if (mergeConflictResolverCommand.length > 0 && !mergeConflictResolverCommand.includes('{{file}}')) {
        throw new Error('Config field desktop.mergeConflictResolverCommand requires {{file}} placeholder when configured');
    }
    if (typeof values.codexSearchEnabled !== 'boolean') throw new Error('Missing config field: desktop.codexSearchEnabled');

    return {
        agent: requireString(values.agent, 'agent'),
        agentProfiles: validateAgentProfiles(values.agentProfiles),
        codexSearchEnabled: values.codexSearchEnabled,
        editorCommand,
        mergeConflictResolverCommand,
        model: requireString(values.model, 'model', true),
        permissionMode: validatePermissionMode(values.permissionMode, 'desktop.permissionMode'),
        thinkingLevel: validateThinkingLevel(values.thinkingLevel, 'desktop.thinkingLevel'),
    };
}

function resolveAppUrl(env = process.env) {
    if (!env.MD2_APP_URL) throw new Error('MD2_APP_URL is required for the unpackaged renderer');

    return env.MD2_APP_URL;
}

function originFromUrl(url) {
    return new URL(url).origin;
}

function resolveBridgeAllowedOrigins(config, appUrl = resolveAppUrl()) {
    if (Array.isArray(config.bridgeAllowedOrigins) && config.bridgeAllowedOrigins.length > 0) {
        return config.bridgeAllowedOrigins.map((origin) => {
            if (typeof origin !== 'string' || origin.length === 0) throw new Error('Invalid bridgeAllowedOrigins entry');

            return origin;
        });
    }

    return [originFromUrl(appUrl)];
}

function resolveDesktopConfig(env = process.env) {
    // Clone so the MD2_AGENT override below cannot mutate the shared built-in constant.
    const agentProfiles = structuredClone(BUILTIN_AGENT_PROFILES);
    if (env.MD2_AGENT) {
        const defaultProfile = agentProfiles.find((profile) => profile.name === DEFAULT_DESKTOP_AGENT);
        defaultProfile.command = [env.MD2_AGENT];
    }
    const bridgeAllowedOrigins = env.MD2_BRIDGE_ALLOWED_ORIGINS
        ? env.MD2_BRIDGE_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter((origin) => origin.length > 0)
        : null;

    return {
        agent: DEFAULT_DESKTOP_AGENT,
        agentProfiles,
        codexSearchEnabled: DEFAULT_CODEX_SEARCH_ENABLED,
        editorCommand: DEFAULT_EDITOR_COMMAND,
        mergeConflictResolverCommand: DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND,
        ...(bridgeAllowedOrigins ? { bridgeAllowedOrigins } : {}),
        model: DEFAULT_DESKTOP_MODEL,
        permissionMode: DEFAULT_DESKTOP_PERMISSION_MODE,
        thinkingLevel: DEFAULT_DESKTOP_THINKING_LEVEL,
    };
}

function readStoredDesktopConfig(store) {
    return store.get(DESKTOP_CONFIG_STORE_KEY) || {};
}

function removeObsoletePermissionFields(value) {
    return Object.fromEntries(Object.entries(value).filter(([fieldName]) => (
        fieldName !== 'accessLevel' && fieldName !== 'approvalPolicy'
    )));
}

function applyDefaultAgentProfileModels(agentProfiles) {
    if (!Array.isArray(agentProfiles)) return agentProfiles;

    return agentProfiles.map((profile) => {
        if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return profile;

        const modelsAreMissing = profile.models === undefined || (Array.isArray(profile.models) && profile.models.length === 0);
        if (!modelsAreMissing) return profile;

        const builtInProfile = BUILTIN_AGENT_PROFILES.find(({ name }) => name === profile.name);
        if (!builtInProfile) return profile;

        return { ...profile, models: builtInProfile.models };
    });
}

function readDesktopConfig(store, env = process.env) {
    const stored = readStoredDesktopConfig(store);
    const storedValues = removeObsoletePermissionFields(stored);
    if (Object.keys(storedValues).length !== Object.keys(stored).length) {
        store.set(DESKTOP_CONFIG_STORE_KEY, storedValues);
    }
    const resolved = { ...resolveDesktopConfig(env), ...storedValues };
    const profilesWithDefaultModels = applyDefaultAgentProfileModels(resolved.agentProfiles);
    const agentProfiles = normalizeAgentProfiles(profilesWithDefaultModels);
    if (env.MD2_AGENT) {
        const defaultProfile = agentProfiles.find((profile) => profile.name === DEFAULT_DESKTOP_AGENT);
        if (defaultProfile) defaultProfile.command = [env.MD2_AGENT];
    }

    return { ...resolved, agentProfiles };
}

function writeDesktopConfig(store, values) {
    const storedValues = removeObsoletePermissionFields(readStoredDesktopConfig(store));
    const next = { ...storedValues, ...values };
    store.set(DESKTOP_CONFIG_STORE_KEY, next);

    return next;
}

function saveDesktopConfig(store, values, env = process.env) {
    const normalized = validateDesktopConfig(values);
    writeDesktopConfig(store, normalized);

    return validateDesktopConfig(readDesktopConfig(store, env));
}

module.exports = {
    DEFAULT_DESKTOP_AGENT,
    DEFAULT_DESKTOP_PERMISSION_MODE,
    DEFAULT_DESKTOP_MODEL,
    DEFAULT_DESKTOP_THINKING_LEVEL,
    DEFAULT_CODEX_SEARCH_ENABLED,
    DEFAULT_EDITOR_COMMAND,
    DEFAULT_MERGE_CONFLICT_RESOLVER_COMMAND,
    DESKTOP_CONFIG_STORE_KEY,
    readDesktopConfig,
    resolveBridgeAllowedOrigins,
    resolveDesktopConfig,
    resolveAppUrl,
    saveDesktopConfig,
    validateDesktopConfig,
    writeDesktopConfig,
};
