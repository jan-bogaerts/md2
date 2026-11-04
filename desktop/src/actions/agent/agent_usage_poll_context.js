const { executableFromCommand } = require('./agent_executable_availability');

const AGENT_USAGE_POLL_TICK_MS = 120_000;

/**
 * Polls the provider usage of one agent account in the active project folder, with that account's
 * process environment. It owns its own poller, so one account's poll, cooldown or login prompt
 * never blocks or overwrites another account's.
 */
class AgentUsagePollContext {
    constructor(options) {
        const { account, createPoller, cwd, environment, executableResolver, profile, publishRuntimeEvent } = options;
        this.account = account;
        this.clearTimeout = options.clearTimeout;
        this.cwd = cwd;
        this.environment = environment;
        this.executable = null;
        this.executableResolver = executableResolver;
        this.now = options.now;
        this.profile = profile;
        this.publishRuntimeEvent = publishRuntimeEvent;
        this.setTimeout = options.setTimeout;
        this.stopped = false;
        this.tickTimer = null;
        this.handleObservedEvent = this.handleObservedEvent.bind(this);
        this.handleRecordedEvent = this.handleRecordedEvent.bind(this);
        this.handleTick = this.handleTick.bind(this);
        // Claude polls repeat while work happens, so their results are recorded; the one Codex poll is an initial observation.
        this.poller = createPoller(profile.name === 'claude' ? this.handleRecordedEvent : this.handleObservedEvent);
    }

    /** Whether this context still polls the given profile command and account configuration directory. */
    matches(profile, account) {
        return this.profile.command.join('\u0000') === profile.command.join('\u0000')
            && this.account.configDirectory === account.configDirectory;
    }

    /** Resolves the provider in the account environment and starts the first poll. */
    async start() {
        const observedAt = this.now();
        const [configuredExecutable, ...configuredArguments] = this.profile.command;
        executableFromCommand(this.profile.command);
        const executable = await this.executableResolver.find(configuredExecutable, { cwd: this.cwd, env: this.environment });
        // Resolution outlives a project switch or account change, and its result belongs to the context it started in.
        if (this.stopped) return;
        if (!executable) {
            await this.handleObservedEvent({ kind: 'unavailable', observedAt });
            return;
        }
        this.executable = executable;
        if (this.profile.name !== 'claude') {
            this.poller.requestPoll({ argumentsList: configuredArguments, cwd: this.cwd, env: this.environment, executable, observedAt });
            return;
        }
        const pollRequest = { cwd: this.cwd, env: this.environment, executable, observedAt, onRuntimeEvent: this.handleObservedEvent };
        this.poller.requestPoll(pollRequest);
        this.scheduleTick();
    }

    /** Refreshes usage after a run of this account; Codex reports it inside its own protocol instead. */
    requestRunPoll({ cwd, env, executable }) {
        if (this.stopped || this.profile.name !== 'claude') return;
        this.poller.requestPoll({ cwd, env, executable });
    }

    /**
     * Keeps the Claude usage poll repeating, whatever the previous one returned. The poller's own
     * cooldown stays the floor between poll starts, so an interval poll and a run-triggered poll
     * never put two processes of this account side by side.
     */
    scheduleTick() {
        if (this.stopped || this.tickTimer) return;
        this.tickTimer = this.setTimeout(this.handleTick, AGENT_USAGE_POLL_TICK_MS);
    }

    handleTick() {
        this.tickTimer = null;
        if (this.stopped) return;
        this.poller.requestPoll({ cwd: this.cwd, env: this.environment, executable: this.executable });
        this.scheduleTick();
    }

    async handleObservedEvent(event) {
        if (this.stopped) return;
        await this.publishRuntimeEvent(this.profile.name, this.account.id, event, false);
    }

    async handleRecordedEvent(event) {
        if (this.stopped) return;
        await this.publishRuntimeEvent(this.profile.name, this.account.id, event, true);
    }

    async stop() {
        this.stopped = true;
        if (this.tickTimer) this.clearTimeout(this.tickTimer);
        this.tickTimer = null;
        await this.poller.stop();
    }
}

module.exports = { AGENT_USAGE_POLL_TICK_MS, AgentUsagePollContext };
