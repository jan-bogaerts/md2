import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AgentUsagePollService } = require('./agent_usage_poll_service');
const { ClaudeRuntimeService } = require('./claude_runtime_service');

const INITIAL_CLAUDE = { id: 'claude-initial', agent: 'claude', kind: 'initial', name: 'Default' };
const INITIAL_CODEX = { id: 'codex-initial', agent: 'codex', kind: 'initial', name: 'Default' };
const WORK_CLAUDE = {id: '11111111-1111-4111-8111-111111111111', agent: 'claude', kind: 'directory', name: 'work', configDirectory: '/accounts/claude-work'};
const WORK_CODEX = {id: '22222222-2222-4222-8222-222222222222', agent: 'codex', kind: 'directory', name: 'work', configDirectory: '/accounts/codex-work'};
const PROFILES = [
    { command: ['claude', '--configured'], name: 'claude' },
    { command: ['codex', '--configured'], name: 'codex' },
    { command: ['custom'], name: 'custom' },
];

/** A usage poll service whose pollers are fakes keyed by the account environment they were started with. */
function pollServiceFixture(overrides = {}) {
    const pollers = [];
    const ticks = [];
    const createPoller = (agent) => (onRuntimeEvent) => {
        const poller = { agent, onRuntimeEvent, requestPoll: vi.fn(), stop: vi.fn(async () => undefined) };
        pollers.push(poller);

        return poller;
    };
    const service = new AgentUsagePollService({
        clearTimeout: vi.fn(),
        createClaudeUsagePoller: createPoller('claude'),
        createCodexUsagePoller: createPoller('codex'),
        environment: { CLAUDE_CONFIG_DIR: '/inherited/claude', NODE_OPTIONS: '--inspect', PATH: '/bin' },
        executableResolver: { find: vi.fn(async (executable) => `/tools/${executable}.cmd`) },
        now: () => 10,
        setTimeout: vi.fn((callback) => {
            ticks.push(callback);

            return ticks.length;
        }),
        ...overrides,
    });

    return { pollers, service, ticks };
}

function pollerEnvironment(poller) {
    return poller.requestPoll.mock.calls[0][0].env;
}

describe('AgentUsagePollService', () => {
    it('starts one context per configured account of each configured built-in provider in the project folder', async () => {
        const { pollers, service } = pollServiceFixture();

        service.startProject({ rootPath: '/projects/md2' }, PROFILES, [INITIAL_CLAUDE, INITIAL_CODEX, WORK_CLAUDE, WORK_CODEX]);
        await vi.waitFor(() => expect(pollers.every((poller) => poller.requestPoll.mock.calls.length === 1)).toBe(true));

        expect(pollers).toHaveLength(4);
        expect(service.contexts.size).toBe(4);
        const [initialClaude, initialCodex, workClaude, workCodex] = [
            pollers.find(({ agent }) => agent === 'claude'),
            pollers.find(({ agent }) => agent === 'codex'),
            pollers.findLast(({ agent }) => agent === 'claude'),
            pollers.findLast(({ agent }) => agent === 'codex'),
        ];
        // The folder is the whole point: Claude's trust question is asked per folder.
        expect(initialClaude.requestPoll).toHaveBeenCalledWith(expect.objectContaining({cwd: '/projects/md2', executable: '/tools/claude.cmd', observedAt: 10}));
        expect(initialCodex.requestPoll).toHaveBeenCalledWith(expect.objectContaining({ argumentsList: ['--configured'], cwd: '/projects/md2' }));
        expect(pollerEnvironment(initialClaude)).not.toHaveProperty('NODE_OPTIONS');
        expect(pollerEnvironment(initialClaude).CLAUDE_CONFIG_DIR).toBe('/inherited/claude');
        expect(pollerEnvironment(workClaude).CLAUDE_CONFIG_DIR).toBe(path.resolve('/accounts/claude-work'));
        expect(pollerEnvironment(initialCodex)).not.toHaveProperty('CODEX_HOME');
        expect(pollerEnvironment(workCodex).CODEX_HOME).toBe(path.resolve('/accounts/codex-work'));
    });

    it('skips accounts of providers without a configured profile and starts nothing before a project', () => {
        const { pollers, service } = pollServiceFixture();

        service.reconcileAccounts(PROFILES, [INITIAL_CLAUDE]);
        expect(pollers).toHaveLength(0);

        service.startProject({ rootPath: '/project' }, [PROFILES[0]], [INITIAL_CLAUDE, INITIAL_CODEX]);
        expect([...service.contexts.keys()]).toEqual(['claude/claude-initial']);
    });

    it('stops every context on a project switch and restarts them in the new folder', async () => {
        const { pollers, service } = pollServiceFixture();
        service.startProject({ rootPath: '/first' }, PROFILES, [INITIAL_CLAUDE]);
        await vi.waitFor(() => expect(pollers[0].requestPoll).toHaveBeenCalledOnce());

        service.startProject({ rootPath: '/second' }, PROFILES, [INITIAL_CLAUDE]);
        await vi.waitFor(() => expect(pollers[1].requestPoll).toHaveBeenCalledOnce());

        expect(pollers[0].stop).toHaveBeenCalledOnce();
        expect(pollers[1].requestPoll).toHaveBeenCalledWith(expect.objectContaining({ cwd: '/second' }));
        expect(service.contexts.size).toBe(1);
    });

    it('stops only the removed account and restarts an account moved to another folder', async () => {
        const { pollers, service } = pollServiceFixture();
        service.startProject({ rootPath: '/project' }, PROFILES, [INITIAL_CLAUDE, WORK_CLAUDE, WORK_CODEX]);
        await vi.waitFor(() => expect(pollers).toHaveLength(3));
        const [initialPoller, workClaudePoller, workCodexPoller] = pollers;

        const movedCodex = { ...WORK_CODEX, configDirectory: '/accounts/moved' };
        service.reconcileAccounts(PROFILES, [INITIAL_CLAUDE, movedCodex]);
        await vi.waitFor(() => expect(pollers[3]?.requestPoll).toHaveBeenCalledOnce());

        expect(initialPoller.stop).not.toHaveBeenCalled();
        expect(workClaudePoller.stop).toHaveBeenCalledOnce();
        expect(workCodexPoller.stop).toHaveBeenCalledOnce();
        expect(pollerEnvironment(pollers[3]).CODEX_HOME).toBe(path.resolve('/accounts/moved'));
        expect([...service.contexts.keys()]).toEqual(['claude/claude-initial', `codex/${WORK_CODEX.id}`]);
    });

    it('stops every context on shutdown and ignores executable resolution completing afterwards', async () => {
        const resolution = Promise.withResolvers();
        const { pollers, service } = pollServiceFixture({ executableResolver: { find: vi.fn(async () => resolution.promise) } });
        service.startProject({ rootPath: '/project' }, PROFILES, [INITIAL_CLAUDE, INITIAL_CODEX]);

        await service.stop();
        resolution.resolve('/tools/claude.cmd');
        await Promise.resolve();
        service.startProject({ rootPath: '/other' }, PROFILES, [INITIAL_CLAUDE]);

        expect(pollers.map(({ stop }) => stop.mock.calls.length)).toEqual([1, 1]);
        expect(pollers.every(({ requestPoll }) => requestPoll.mock.calls.length === 0)).toBe(true);
        expect(service.contexts.size).toBe(0);
    });

    it('keeps polling each Claude account on its own interval until the context stops', async () => {
        const { pollers, service, ticks } = pollServiceFixture();
        service.startProject({ rootPath: '/project' }, PROFILES, [INITIAL_CLAUDE]);
        await vi.waitFor(() => expect(pollers[0].requestPoll).toHaveBeenCalledOnce());

        for (let index = 0; index < 3; index += 1) ticks.at(-1)();
        expect(pollers[0].requestPoll).toHaveBeenCalledTimes(4);
        expect(pollers[0].requestPoll).toHaveBeenLastCalledWith({cwd: '/project', env: expect.objectContaining({}), executable: '/tools/claude.cmd'});

        await service.stop();
        ticks.at(-1)();
        expect(pollers[0].requestPoll).toHaveBeenCalledTimes(4);
    });

    it('routes run polls to the context of the run account only', async () => {
        const { pollers, service } = pollServiceFixture();
        service.startProject({ rootPath: '/project' }, PROFILES, [INITIAL_CLAUDE, WORK_CLAUDE, INITIAL_CODEX]);
        await vi.waitFor(() => expect(pollers).toHaveLength(3));
        const runRequest = { cwd: '/project', env: { PATH: '/bin' }, executable: '/tools/claude.cmd' };

        service.requestRunPoll('claude', WORK_CLAUDE.id, runRequest);
        service.requestRunPoll('codex', 'codex-initial', runRequest);
        service.requestRunPoll('claude', 'removed-account', runRequest);

        expect(pollers[1].requestPoll).toHaveBeenLastCalledWith(runRequest);
        expect(pollers[0].requestPoll).not.toHaveBeenCalledWith(runRequest);
        expect(pollers[2].requestPoll).not.toHaveBeenCalledWith(runRequest);
    });

    it('publishes a failing account as unavailable without touching the snapshot of another account', async () => {
        const claudeRuntimeService = new ClaudeRuntimeService();
        const usageMetricsService = { recordAccountUsage: vi.fn(async () => true) };
        const { pollers, service } = pollServiceFixture({ claudeRuntimeService, usageMetricsService });
        service.startProject({ rootPath: '/project' }, PROFILES, [INITIAL_CLAUDE, WORK_CLAUDE]);
        await vi.waitFor(() => expect(pollers).toHaveLength(2));
        const windows = [{ id: 'five_hour', resetsAt: 1_000, usedPercent: 20 }, { id: 'weekly', resetsAt: 2_000, usedPercent: 40 }];

        await pollers[0].onRuntimeEvent({ kind: 'snapshot', observedAt: 30, payload: { windows } });
        await pollers[1].onRuntimeEvent({ kind: 'unavailable', observedAt: 31 });

        expect(claudeRuntimeService.getSnapshot('claude-initial')).toMatchObject({ available: true, observedAt: 30 });
        expect(claudeRuntimeService.getSnapshot(WORK_CLAUDE.id)).toMatchObject({ available: false, observedAt: 31 });
        expect(usageMetricsService.recordAccountUsage).toHaveBeenCalledExactlyOnceWith('claude', expect.objectContaining({ accountId: 'claude-initial' }));
    });

    it('publishes initial results without metrics and maps a rejected payload to unavailable', async () => {
        const codexRuntimeService = { publishRateLimits: vi.fn(() => false), publishUnavailable: vi.fn() };
        const usageMetricsService = { recordAccountUsage: vi.fn() };
        const { pollers, service } = pollServiceFixture({ codexRuntimeService, usageMetricsService });
        service.startProject({ rootPath: '/project' }, PROFILES, [WORK_CODEX]);
        await vi.waitFor(() => expect(pollers[0].requestPoll).toHaveBeenCalledOnce());
        const payload = { rateLimits: {} };

        await pollers[0].onRuntimeEvent({ kind: 'snapshot', observedAt: 31, payload });

        expect(codexRuntimeService.publishRateLimits).toHaveBeenCalledWith(WORK_CODEX.id, payload, 31, false);
        expect(codexRuntimeService.publishUnavailable).toHaveBeenCalledWith(WORK_CODEX.id, 31);
        expect(usageMetricsService.recordAccountUsage).not.toHaveBeenCalled();
    });

    it('publishes unavailable for a missing executable and ignores events of a stopped context', async () => {
        const claudeRuntimeService = { publishRateLimits: vi.fn(), publishUnavailable: vi.fn() };
        const { pollers, service } = pollServiceFixture({ claudeRuntimeService, executableResolver: { find: vi.fn(async () => null) } });

        service.startProject({ rootPath: '/project' }, PROFILES, [INITIAL_CLAUDE]);
        await vi.waitFor(() => expect(claudeRuntimeService.publishUnavailable).toHaveBeenCalledWith('claude-initial', 10));
        service.reconcileAccounts(PROFILES, []);
        await pollers[0].onRuntimeEvent({ kind: 'unavailable', observedAt: 20 });

        expect(pollers[0].requestPoll).not.toHaveBeenCalled();
        expect(claudeRuntimeService.publishUnavailable).toHaveBeenCalledOnce();
    });

    it('rejects a project without a folder', () => {
        const { service } = pollServiceFixture();

        expect(() => service.startProject(null, PROFILES, [])).toThrow('Missing local Git project rootPath');
    });
});
