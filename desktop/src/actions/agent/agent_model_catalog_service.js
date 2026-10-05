const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
    buildAgentCommand, buildAgentExecutionCommand, buildAgentStreamingCommand, CODEX_MAX_THINKING_LEVEL,
    defaultModelForProfile, supportsModelDiscovery, validateAgentProfiles,
} = require('../../../../shared/agent_profiles.mjs');
const { validateAgentModelCatalog, validateCatalogSelection } = require('../../../../shared/agent_model_catalog.mjs');
const { resolveAgentCommand } = require('./agent_profiles.mjs');
const { AgentExecutableResolver } = require('./agent_executable_availability');
const { createAgentEnvironment } = require('./agent_environment');
const { AgentCatalogProcess } = require('./agent_catalog_process');
const { readCodexModelCatalog } = require('./codex_model_catalog');
const { CLAUDE_CATALOG_ARGUMENTS, readClaudeModelCatalog } = require('./claude_model_catalog');

const CATALOG_TTL_MS = 5 * 60 * 1000;
const MAX_CATALOG_CONTEXTS = 32;
const MAX_CONCURRENT_PROBES = 4;
const MAX_CONFIGURATION_ANCESTORS = 32;

async function fileFingerprint(filePath) {
    try {
        const metadata = await fs.stat(filePath);

        return [filePath, metadata.size, metadata.mtimeMs];
    } catch (error) {
        if (error.code === 'ENOENT') return [filePath, null];
        throw error;
    }
}

async function settingsFingerprint(agent, cwd, environment) {
    const userDirectory = agent === 'codex'
        ? environment.CODEX_HOME ?? path.join(os.homedir(), '.codex')
        : environment.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
    const files = agent === 'codex'
        ? ['config.toml', 'requirements.toml', 'auth.json', 'models_cache.json'].map((name) => path.join(userDirectory, name))
        : [path.join(userDirectory, 'settings.json'), path.join(userDirectory, '.credentials.json'), path.join(os.homedir(), '.claude.json')];
    let directory = cwd;
    for (let depth = 0; depth < MAX_CONFIGURATION_ANCESTORS; depth++) {
        files.push(...(agent === 'codex'
            ? [path.join(directory, '.codex', 'config.toml')]
            : [path.join(directory, '.claude', 'settings.json'), path.join(directory, '.claude', 'settings.local.json')]));
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
    }

    return await Promise.all(files.map(fileFingerprint));
}

/** Own authoritative host catalogs, bounded probe lifecycles, and execution capability checks. */
class AgentModelCatalogService {
    constructor(dependencies = {}) {
        this.executableResolver = dependencies.executableResolver ?? new AgentExecutableResolver();
        this.createProbe = dependencies.createProbe ?? ((agent) => new AgentCatalogProcess(agent));
        this.fingerprint = dependencies.fingerprint ?? fileFingerprint;
        this.settingsFingerprint = dependencies.settingsFingerprint ?? settingsFingerprint;
        this.environment = dependencies.environment ?? process.env;
        this.now = dependencies.now ?? Date.now;
        this.cache = new Map();
        this.pending = new Map();
        this.activeProbes = new Set();
    }

    async load(profileValue, cwd, refresh = false) {
        const [profile] = validateAgentProfiles([profileValue]);
        if (typeof cwd !== 'string' || !path.isAbsolute(cwd)) throw new Error('Model catalog requires an absolute working directory');
        if (!supportsModelDiscovery(profile)) {
            return validateAgentModelCatalog({
                agent: profile.name, provider: profile.name, source: 'configured', fetchedAt: this.now(),
                models: profile.models.map((id) => ({ id, displayName: id, hidden: false, reasoningEfforts: [], serviceTiers: [] })),
            });
        }
        const environment = createAgentEnvironment(this.environment, profile.name);
        const command = buildAgentCommand(profile, defaultModelForProfile(profile));
        const executable = await this.executableResolver.find(command[0], { cwd, env: environment });
        if (!executable) throw new Error(`Executable not found for ${profile.name}: ${command[0]}`);
        const fingerprints = await Promise.all([
            this.fingerprint(executable),
            this.settingsFingerprint(profile.name, cwd, environment),
        ]);
        const key = crypto.createHash('sha256').update(JSON.stringify([profile, executable, cwd, environment, fingerprints])).digest('hex');
        if (refresh) this.cache.delete(key);
        const cached = this.cache.get(key);
        if (cached && this.now() - cached.fetchedAt < CATALOG_TTL_MS) return cached;
        const pending = this.pending.get(key);
        if (pending) return await pending;
        if (this.activeProbes.size >= MAX_CONCURRENT_PROBES) throw new Error('Model discovery is busy; retry shortly');
        const request = this.discover(profile, executable, command.slice(1), cwd, environment, key);
        this.pending.set(key, request);
        try {
            return await request;
        } finally {
            this.pending.delete(key);
        }
    }

    async discover(profile, executable, argumentsList, cwd, environment, key) {
        const probe = this.createProbe(profile.name);
        this.activeProbes.add(probe);
        try {
            const catalogArguments = profile.name === 'codex' ? ['app-server', '--stdio'] : CLAUDE_CATALOG_ARGUMENTS;
            probe.start(executable, [...argumentsList, ...catalogArguments], { cwd, env: environment });
            const result = profile.name === 'codex'
                ? await readCodexModelCatalog(probe, cwd)
                : await readClaudeModelCatalog(probe);
            const catalog = validateAgentModelCatalog({agent: profile.name, provider: result.provider, source: 'runtime', fetchedAt: this.now(), executable, models: result.models});
            if (this.cache.size >= MAX_CATALOG_CONTEXTS) this.cache.delete(this.cache.keys().next().value);
            this.cache.set(key, catalog);

            return catalog;
        } finally {
            try {
                await probe.close();
            } finally {
                this.activeProbes.delete(probe);
            }
        }
    }

    async resolveExecution(config, selection, streaming, cwd) {
        const resolved = resolveAgentCommand(config, selection, streaming);
        const catalog = await this.load(resolved.profile, cwd);
        const { serviceTier } = validateCatalogSelection(catalog, resolved);
        const speedSettings = { speedMode: resolved.speedMode, serviceTier };
        const command = streaming
            ? buildAgentStreamingCommand(
                resolved.profile, resolved.model, resolved.thinkingLevel, resolved.permissionMode, speedSettings,
            )
            : buildAgentExecutionCommand(
                resolved.profile, resolved.model, resolved.thinkingLevel,
                config.codexSearchEnabled ?? true, resolved.permissionMode, speedSettings,
            );
        const reasoningEffort = resolved.agent === 'codex' && resolved.thinkingLevel === 'max'
            ? CODEX_MAX_THINKING_LEVEL : resolved.thinkingLevel;
        const executionSettings = {
            model: resolved.model,
            ...(resolved.thinkingLevel !== 'none' ? { effort: reasoningEffort } : {}),
            ...(serviceTier !== undefined ? { serviceTier } : {}),
        };

        return { ...resolved, command, executionSettings };
    }

    async stop() {
        for (const probe of this.activeProbes) await probe.close();
        this.activeProbes.clear();
        this.cache.clear();
    }
}

module.exports = { AgentModelCatalogService };
