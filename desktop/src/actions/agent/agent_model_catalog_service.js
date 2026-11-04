const os = require('node:os');
const { buildAgentCommand, defaultModelForProfile, supportsModelDiscovery, validateAgentProfiles } = require('../../../../shared/agent_profiles.mjs');
const { validateAgentModelCatalog } = require('../../../../shared/agent_model_catalog.mjs');
const { AgentExecutableResolver } = require('./agent_executable_availability');
const { createAgentEnvironment } = require('./agent_environment');
const { AgentCatalogProcess } = require('./agent_catalog_process');
const { readCodexModelCatalog } = require('./codex_model_catalog');
const { CLAUDE_CATALOG_ARGUMENTS, readClaudeModelCatalog } = require('./claude_model_catalog');

/** Cache key of one catalog: an agent's model list depends on the account it is discovered with. */
function catalogKey(agent, accountId) {
    return `${agent}/${accountId ?? ''}`;
}

/** Own the shared model list for each agent account, independent of projects and connections. */
class AgentModelCatalogService extends EventTarget {
    constructor(dependencies = {}) {
        super();
        this.executableResolver = dependencies.executableResolver ?? new AgentExecutableResolver();
        this.createProbe = dependencies.createProbe ?? ((agent) => new AgentCatalogProcess(agent));
        this.environment = dependencies.environment ?? process.env;
        this.workingDirectory = dependencies.workingDirectory ?? os.homedir();
        this.catalogs = new Map();
        this.pending = new Map();
        this.activeProbes = new Set();
    }

    /**
     * Loads the catalog of one agent account. `account` is the resolved account record, or `null`
     * for an agent without accounts; discovery runs in that account's configuration directory.
     */
    async load(profileValue, account, refresh = false) {
        const [profile] = validateAgentProfiles([profileValue]);
        const accountId = account?.id ?? null;
        const key = catalogKey(profile.name, accountId);
        const pending = this.pending.get(key);
        if (pending) return await pending;
        if (!refresh || !supportsModelDiscovery(profile)) {
            const catalog = this.catalogs.get(key);
            if (catalog && !refresh) return catalog;
            const configuredModels = profile.models.map((id) => ({ id, displayName: id, hidden: false }));
            const configuredCatalog = { agent: profile.name, accountId, models: configuredModels };

            return this.publish(configuredCatalog);
        }
        const request = this.discover(profile, account);
        this.pending.set(key, request);
        try {
            return await request;
        } finally {
            this.pending.delete(key);
        }
    }

    async discover(profile, account) {
        const environment = createAgentEnvironment(this.environment, profile.name, false, account);
        const command = buildAgentCommand(profile, defaultModelForProfile(profile));
        const cwd = this.workingDirectory;
        const executable = await this.executableResolver.find(command[0], { cwd, env: environment });
        if (!executable) throw new Error(`Executable not found for ${profile.name}: ${command[0]}`);
        const probe = this.createProbe(profile.name);
        this.activeProbes.add(probe);
        try {
            const catalogArguments = profile.name === 'codex' ? ['app-server', '--stdio'] : CLAUDE_CATALOG_ARGUMENTS;
            probe.start(executable, [...command.slice(1), ...catalogArguments], { cwd, env: environment });
            const result = profile.name === 'codex'
                ? await readCodexModelCatalog(probe)
                : await readClaudeModelCatalog(probe);
            const discoveredCatalog = { agent: profile.name, accountId: account?.id ?? null, models: result.models };

            return this.publish(discoveredCatalog);
        } finally {
            try {
                await probe.close();
            } finally {
                this.activeProbes.delete(probe);
            }
        }
    }

    publish(value) {
        const catalog = validateAgentModelCatalog(value);
        this.catalogs.set(catalogKey(catalog.agent, catalog.accountId), catalog);
        this.dispatchEvent(new CustomEvent('catalog', { detail: catalog }));

        return catalog;
    }

    async stop() {
        for (const probe of this.activeProbes) await probe.close();
        this.activeProbes.clear();
    }
}

module.exports = { AgentModelCatalogService };
