const os = require('node:os');
const { buildAgentCommand, defaultModelForProfile, supportsModelDiscovery, validateAgentProfiles } = require('../../../../shared/agent_profiles.mjs');
const { validateAgentModelCatalog } = require('../../../../shared/agent_model_catalog.mjs');
const { AgentExecutableResolver } = require('./agent_executable_availability');
const { createAgentEnvironment } = require('./agent_environment');
const { AgentCatalogProcess } = require('./agent_catalog_process');
const { readCodexModelCatalog } = require('./codex_model_catalog');
const { CLAUDE_CATALOG_ARGUMENTS, readClaudeModelCatalog } = require('./claude_model_catalog');

/** Own the shared model list for each agent, independent of projects and connections. */
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

    async load(profileValue, refresh = false) {
        const [profile] = validateAgentProfiles([profileValue]);
        const pending = this.pending.get(profile.name);
        if (pending) return await pending;
        if (!refresh || !supportsModelDiscovery(profile)) {
            const catalog = this.catalogs.get(profile.name);
            if (catalog && !refresh) return catalog;

            return this.publish({
                agent: profile.name,
                models: profile.models.map((id) => ({ id, displayName: id, hidden: false })),
            });
        }
        const request = this.discover(profile);
        this.pending.set(profile.name, request);
        try {
            return await request;
        } finally {
            this.pending.delete(profile.name);
        }
    }

    async discover(profile) {
        const environment = createAgentEnvironment(this.environment, profile.name);
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

            return this.publish({ agent: profile.name, models: result.models });
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
        this.catalogs.set(catalog.agent, catalog);
        this.dispatchEvent(new CustomEvent('catalog', { detail: catalog }));

        return catalog;
    }

    async stop() {
        for (const probe of this.activeProbes) await probe.close();
        this.activeProbes.clear();
    }
}

module.exports = { AgentModelCatalogService };
