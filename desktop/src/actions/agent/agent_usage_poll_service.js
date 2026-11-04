const { AgentExecutableResolver } = require('./agent_executable_availability');
const { createAgentAccountEnvironment } = require('./agent_account_environment');
const { ClaudeUsagePoller } = require('./claude_usage_poller');
const { CodexUsagePoller } = require('./codex_usage_poller');
const { AgentUsagePollContext } = require('./agent_usage_poll_context');
const { publishClaudeRuntimeEvent, publishCodexRuntimeEvent } = require('./agent_runtime_usage');
const { terminateProcessTree } = require('../process_tree');
const { requireRootPath } = require('../../git/git_commands');

const USAGE_POLL_AGENTS = ['claude', 'codex'];

function contextKey(agent, accountId) {
    return `${agent}/${accountId}`;
}

/** Stops contexts without waiting: a stopped context ignores late events, and its process cleanup is logged when it fails. */
function stopContexts(contexts) {
    for (const context of contexts) {
        void context.stop().catch((error) => console.error('[agent:usage-poll-stop]', context.account.id, error));
    }
}

/**
 * Owns one usage poll context per configured account of each configured built-in provider. The
 * collection is bounded by the configured account list: contexts start for the active project's
 * folder and stop on project switch, account removal, and application shutdown.
 *
 * The folder matters: Claude asks whether the files in a folder are trusted the first time it runs
 * there, and that question blocks the poll. Polling the project folder means the answer covers the
 * folder agents are about to run in anyway.
 */
class AgentUsagePollService {
    constructor(dependencies = {}) {
        this.runtimeServices = {
            claudeRuntimeService: dependencies.claudeRuntimeService ?? null,
            codexRuntimeService: dependencies.codexRuntimeService ?? null,
            usageMetricsService: dependencies.usageMetricsService ?? null,
        };
        this.clearTimeout = dependencies.clearTimeout ?? clearTimeout;
        this.environment = dependencies.environment ?? process.env;
        this.executableResolver = dependencies.executableResolver ?? new AgentExecutableResolver();
        this.now = dependencies.now ?? Date.now;
        this.setTimeout = dependencies.setTimeout ?? setTimeout;
        const terminate = dependencies.terminateProcessTree ?? terminateProcessTree;
        this.createClaudeUsagePoller = dependencies.createClaudeUsagePoller
            ?? ((onRuntimeEvent) => new ClaudeUsagePoller({ onRuntimeEvent }));
        this.createCodexUsagePoller = dependencies.createCodexUsagePoller
            ?? ((onRuntimeEvent) => new CodexUsagePoller({ onRuntimeEvent, terminateProcessTree: terminate }));
        this.publishRuntimeEvent = this.publishRuntimeEvent.bind(this);
        this.contexts = new Map();
        this.cwd = null;
        this.stopped = false;
    }

    /** Moves every poll to a newly activated project folder: all contexts restart there. */
    startProject(project, profiles, accounts) {
        const cwd = requireRootPath(project);
        if (this.stopped) return;
        this.cwd = cwd;
        stopContexts([...this.contexts.values()]);
        this.contexts.clear();
        this.reconcileAccounts(profiles, accounts);
    }

    /**
     * Aligns the contexts with the configured accounts after an account was added, removed, or
     * pointed at another folder. Unchanged accounts keep polling; nothing starts before a project.
     */
    reconcileAccounts(profiles, accounts) {
        if (!Array.isArray(profiles)) throw new Error('Usage polling requires agent profiles');
        if (!Array.isArray(accounts)) throw new Error('Usage polling requires agent accounts');
        if (this.stopped || this.cwd === null) return;
        const wanted = new Map();
        for (const agent of USAGE_POLL_AGENTS) {
            const profile = profiles.find(({ name }) => name === agent);
            if (!profile) continue;
            for (const account of accounts.filter((candidate) => candidate.agent === agent)) {
                wanted.set(contextKey(agent, account.id), { account, profile });
            }
        }
        const stale = [...this.contexts].filter(([key, context]) => {
            const target = wanted.get(key);

            return !target || !context.matches(target.profile, target.account);
        });
        stale.forEach(([key]) => this.contexts.delete(key));
        stopContexts(stale.map(([, context]) => context));
        for (const [key, { account, profile }] of wanted) {
            if (this.contexts.has(key)) continue;
            const context = this.createContext(profile, account);
            this.contexts.set(key, context);
            void context.start().catch((error) => console.error('[agent:usage-poll-start]', key, error));
        }
    }

    /** Refreshes the usage of the account a run used, once that run starts or closes. */
    requestRunPoll(agent, accountId, request) {
        this.contexts.get(contextKey(agent, accountId))?.requestRunPoll(request);
    }

    async stop() {
        this.stopped = true;
        const contexts = [...this.contexts.values()];
        this.contexts.clear();
        await Promise.all(contexts.map((context) => context.stop()));
    }

    createContext(profile, account) {
        const createPoller = profile.name === 'claude' ? this.createClaudeUsagePoller : this.createCodexUsagePoller;

        return new AgentUsagePollContext({
            account,
            clearTimeout: this.clearTimeout,
            createPoller,
            cwd: this.cwd,
            environment: createAgentAccountEnvironment(this.environment, account),
            executableResolver: this.executableResolver,
            now: this.now,
            profile,
            publishRuntimeEvent: this.publishRuntimeEvent,
            setTimeout: this.setTimeout,
        });
    }

    publishRuntimeEvent(agent, accountId, event, recordUsage) {
        if (agent === 'claude') return publishClaudeRuntimeEvent(this.runtimeServices, accountId, event, recordUsage);

        return publishCodexRuntimeEvent(this.runtimeServices, accountId, event, recordUsage);
    }
}

module.exports = { AgentUsagePollService };
