import { promises as fsPromises } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AgentRunnerService } = require('./agent_runner_service');
const { upsertActivityConversation } = require('./activity_files');
const { findActivityConversation } = require('../../../shared/card_activity.mjs');
const { conversationActivityReference, parseConversationActivityReference } = require('../../../shared/activity_paths.mjs');

function createService(dependencies = {}) {
    return new AgentRunnerService({
        ...dependencies,
        persistTerminalConversation: (run) => upsertActivityConversation(
            run.request.activityProject,
            run.request.projectFolder,
            run.request.activityOrigin,
            run.conversation,
        ),
    });
}

function createProject(rootPath) {
    return { branch: 'main', id: 'local', rootPath };
}

function agentRequest(overrides) {
    return { projectFolder: 'design', ...overrides };
}

async function readPersistedConversation(rootPath, reference) {
    const { activityPath, conversationId } = parseConversationActivityReference(reference);
    const activity = JSON.parse(await readFile(join(rootPath, activityPath), 'utf8'));

    return findActivityConversation(activity, conversationId);
}

async function prepareProject(rootPath) {
    await mkdir(join(rootPath, '.git'));
    await mkdir(join(rootPath, 'design'));
}

function waitForEvent(events, type) {
    const existing = events.find((event) => event.type === type);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
        const interval = setInterval(() => {
            const event = events.find((item) => item.type === type);
            if (!event) return;

            clearInterval(interval);
            resolve(event);
        }, 5);
    });
}

function waitForEventCount(events, type, count) {
    if (events.filter((event) => event.type === type).length >= count) return Promise.resolve();

    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (events.filter((event) => event.type === type).length < count) return;

            clearInterval(interval);
            resolve();
        }, 5);
    });
}

describe('AgentRunnerService', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('uses pipes and preserves configured arguments and the prompt', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const prompt = 'Reply with exactly: "spawn test ok"\n& echo %PATH%';
        const scriptPath = join(rootPath, 'read-prompt.cjs');

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, 'process.stdout.write(JSON.stringify({configured:process.argv[2],prompt:process.argv[3],tty:process.stdin.isTTY===true}))\n');
            const command = ['node', scriptPath, 'GPT 5.5'];
            const result = await service.run(createProject(rootPath), agentRequest({ command, prompt, scopePath: 'project' }), () => undefined);
            const persisted = await readPersistedConversation(rootPath, result.reference);

            expect(result.stderr).toBe('');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({ configured: 'GPT 5.5', prompt, tty: false });
            expect(persisted.messages.at(-1)).toMatchObject({ content: result.stdout, role: 'assistant' });
            expect(persisted.events).not.toContainEqual(expect.objectContaining({ type: 'stdout' }));
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('passes large transcript context through stdin', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const contextInput = 'history\n'.repeat(20000);
        const scriptPath = join(rootPath, 'read-context.cjs');

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, "let value='';process.stdin.on('data',chunk=>value+=chunk);process.stdin.on('end',()=>process.stdout.write(String(value.length)))\n");
            const command = ['node', scriptPath];
            const result = await service.run(createProject(rootPath), agentRequest({ command, contextInput, prompt: 'next', scopePath: 'project' }), () => undefined);

            expect(result.stdout).toBe(String(contextInput.length));
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it.runIf(process.platform === 'win32')('runs configured Windows command scripts with preserved arguments', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const commandPath = join(rootPath, 'test-agent.cmd');
        const executableResolver = { find: vi.fn(async () => commandPath) };
        const service = createService({ executableResolver });
        const scriptPath = join(rootPath, 'test-agent-script.cjs');
        const prompt = 'spawn test ok';

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, 'process.stdout.write(JSON.stringify(process.argv[3]))\n');
            await writeFile(commandPath, '@echo off\r\nnode "%~dp0test-agent-script.cjs" marker %*\r\n');
            const result = await service.run(createProject(rootPath), agentRequest({
                command: ['test-agent'],
                prompt,
                scopePath: 'project',
            }), () => undefined);

            expect(result.stderr).toBe('');
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toBe(prompt);
            expect(executableResolver.find).toHaveBeenCalledWith('test-agent', { cwd: rootPath, env: process.env });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('streams output deltas and persists normalized transcript data', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const events = [];
        const scriptPath = join(rootPath, 'structured-output.cjs');

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, "console.log(JSON.stringify({type:'thread.started',thread_id:'thread-1'}));console.log(JSON.stringify({type:'turn.started'}));console.log(JSON.stringify({type:'item.completed',item:{type:'file_change',changes:[{path:'design/F-1.md'}]}}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'answer'}}))\n");
            const command = ['node', scriptPath];
            const result = await service.run(createProject(rootPath), agentRequest({
                agent: 'codex',
                cardPath: 'design/F-1.md',
                command,
                prompt: 'question',
            }), (event) => events.push(event));
            const persisted = await readPersistedConversation(rootPath, result.reference);

            expect(result.changedPaths).toEqual(['design/F-1.md']);
            expect(events).toContainEqual(expect.objectContaining({ content: 'answer', type: 'output' }));
            expect(events.every((event) => !Object.hasOwn(event, 'conversation'))).toBe(true);
            expect(persisted.messages).toEqual([
                expect.objectContaining({ content: 'question', role: 'user' }),
                expect.objectContaining({ agent: 'codex', content: 'answer', role: 'assistant' }),
            ]);
            expect(persisted.events).toContainEqual(expect.objectContaining({ type: 'tool.file_change' }));
            expect(persisted.events).not.toContainEqual(expect.objectContaining({ type: 'thread.started' }));
            expect(persisted.providerSessions).toEqual([expect.objectContaining({ agent: 'codex', conversationId: 'thread-1' })]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('persists and accumulates normalized usage across resumed turns', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const firstScriptPath = join(rootPath, 'first-usage.cjs');
        const secondScriptPath = join(rootPath, 'second-usage.cjs');

        try {
            await prepareProject(rootPath);
            await writeFile(firstScriptPath, "console.log(JSON.stringify({type:'thread.started',thread_id:'thread-1'}));console.log(JSON.stringify({type:'turn.started'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'one'}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:10,cached_input_tokens:2,output_tokens:3,reasoning_output_tokens:1}}))\n");
            await writeFile(secondScriptPath, "console.log(JSON.stringify({type:'thread.started',thread_id:'thread-1'}));console.log(JSON.stringify({type:'turn.started'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'two'}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:20,cached_input_tokens:4,output_tokens:6,reasoning_output_tokens:2}}))\n");
            const first = await service.run(createProject(rootPath), agentRequest({agent: 'codex', command: ['node', firstScriptPath], prompt: 'first', scopePath: 'project'}), () => undefined);
            const second = await service.run(createProject(rootPath), agentRequest({
                agent: 'codex', command: ['node', secondScriptPath], conversation: first.conversation,
                prompt: 'second', reference: first.reference, scopePath: 'project',
            }), () => undefined);
            const persisted = await readPersistedConversation(rootPath, second.reference);

            expect(persisted.usage).toEqual({
                cachedInputTokens: 6,
                inputTokens: 24,
                outputTokens: 9,
                reasoningTokens: 3,
                totalTokens: 42,
            });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('persists normalized Claude result usage and reported cost', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const scriptPath = join(rootPath, 'claude-usage.cjs');

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, "console.log(JSON.stringify({type:'system',subtype:'init',session_id:'session-1'}));console.log(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'done'}],usage:{input_tokens:999}}}));console.log(JSON.stringify({type:'result',usage:{input_tokens:20,output_tokens:7,cache_creation_input_tokens:8,cache_read_input_tokens:5},total_cost_usd:0.012}))\n");
            const result = await service.run(createProject(rootPath), agentRequest({agent: 'claude', command: ['node', scriptPath], prompt: 'question', scopePath: 'project'}), () => undefined);
            const persisted = await readPersistedConversation(rootPath, result.reference);

            expect(persisted.usage).toEqual({
                cachedInputTokens: 13,
                costUsd: 0.012,
                inputTokens: 20,
                outputTokens: 7,
                reasoningTokens: 0,
                totalTokens: 40,
            });
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('does not count usage from a failed turn', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const scriptPath = join(rootPath, 'failed-usage.cjs');

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, "console.log(JSON.stringify({type:'thread.started',thread_id:'thread-1'}));console.log(JSON.stringify({type:'turn.started'}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:10}}));process.exit(1)\n");
            const result = await service.run(createProject(rootPath), agentRequest({agent: 'codex', command: ['node', scriptPath], prompt: 'fail', scopePath: 'project'}), () => undefined);
            const persisted = await readPersistedConversation(rootPath, result.reference);

            expect(persisted.usage).toBeUndefined();
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('streams structured provider failures and returns their messages in stderr once', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const events = [];
        const scriptPath = join(rootPath, 'structured-failure.cjs');
        const failureMessage = "The 'GPT' model is not supported when using Codex with a ChatGPT account.";

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, `const message=JSON.stringify({type:'error',status:400,error:{type:'invalid_request_error',message:${JSON.stringify(failureMessage)}}});console.log(JSON.stringify({type:'thread.started',thread_id:'thread-1'}));console.log(JSON.stringify({type:'item.completed',item:{type:'error',message:'model warning'}}));console.log(JSON.stringify({type:'turn.started'}));console.log(JSON.stringify({type:'error',message}));console.log(JSON.stringify({type:'turn.failed',error:{message}}));process.exit(1)\n`);
            const result = await service.run(createProject(rootPath), agentRequest({
                agent: 'codex',
                command: ['node', scriptPath],
                prompt: 'question',
                scopePath: 'project',
            }), (event) => events.push(event));

            expect(events.filter(({ type }) => type === 'error').map(({ content }) => content)).toEqual(['model warning', failureMessage]);
            expect(result.stderr).toBe(`model warning\n${failureMessage}`);
            expect(result.exitCode).not.toBe(0);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('hides agent lifecycle and debugger noise from stderr', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const events = [];
        const scriptPath = join(rootPath, 'noisy-stderr.cjs');

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, "console.log(JSON.stringify({type:'thread.started',thread_id:'thread-1'}));console.log(JSON.stringify({type:'turn.started'}));process.stderr.write('completed\\nDebugger list');process.stderr.write('ening on ws://127.0.0.1:60618/id\\nFor help, see: https://nodejs.org/en/docs/inspector\\nDebugger attached.\\nReading additional input from stdin...\\nvisible warning\\nWaiting for the debugger to disconnect...')\n");
            const result = await service.run(createProject(rootPath), agentRequest({
                agent: 'codex',
                command: ['node', scriptPath],
                prompt: 'question',
                scopePath: 'project',
            }), (event) => events.push(event));
            const persisted = await readPersistedConversation(rootPath, result.reference);

            expect(result.stderr).toBe('visible warning\n');
            expect(events.filter(({ type }) => type === 'error').map(({ content }) => content)).toEqual(['visible warning\n']);
            expect(persisted.events.filter(({ type }) => type === 'error').map(({ content }) => content)).toEqual(['visible warning\n']);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('completes without a provider conversation id and keeps transcript fallback available', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const scriptPath = join(rootPath, 'missing-session.cjs');

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, "console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'partial answer'}}))\n");
            const result = await service.run(createProject(rootPath), agentRequest({
                agent: 'codex',
                command: ['node', scriptPath],
                prompt: 'question',
                scopePath: 'project',
            }), () => undefined);
            const persisted = await readPersistedConversation(rootPath, result.reference);

            expect(result.exitCode).toBe(0);
            expect(persisted.status).toBe('completed');
            expect(persisted.messages.at(-1)).toMatchObject({ content: 'partial answer', role: 'assistant' });
            expect(persisted.providerSessions).toEqual([]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('keeps malformed provider JSONL as a diagnostic without failing the turn', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const events = [];
        const scriptPath = join(rootPath, 'malformed-output.cjs');

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, "console.log('not-json')\n");
            const result = await service.run(createProject(rootPath), agentRequest({
                agent: 'claude',
                command: ['node', scriptPath],
                prompt: 'question',
                scopePath: 'project',
            }), (event) => events.push(event));
            const persisted = await readPersistedConversation(rootPath, result.reference);

            expect(result.exitCode).toBe(0);
            expect(events.some(({ type }) => type === 'error')).toBe(false);
            expect(persisted.events).toContainEqual(expect.objectContaining({content: 'Malformed claude JSONL event: not-json', type: 'diagnostic'}));
            expect(persisted.status).toBe('completed');
            expect(persisted.messages).toHaveLength(1);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('cancels only the active turn without advancing its provider cursor', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const events = [];
        const conversation = {
            actionId: 'implement', completedAt: 'earlier', events: [], id: 'conversation-1',
            messages: [{ content: 'old', id: 'message-1', role: 'user', timestamp: 'earlier' }],
            providerSessions: [{ agent: 'codex', conversationId: 'thread-1', createdAt: 'earlier', lastUsedAt: 'earlier', synchronizedThroughMessageId: 'message-1' }],
            startedAt: 'earlier', status: 'completed', title: 'Implement',
        };

        try {
            await prepareProject(rootPath);
            const started = await service.start(createProject(rootPath), agentRequest({
                agent: 'codex', command: ['node', '-e', 'setTimeout(()=>{},10000)'], conversation,
                prompt: 'next', reference: conversationActivityReference('design/activity/project.json', conversation.id), scopePath: 'project',
            }), (event) => events.push(event));
            service.stop(started.runId);
            await waitForEvent(events, 'closed');
            const persisted = await readPersistedConversation(rootPath, started.reference);

            expect(persisted.status).toBe('cancelled');
            expect(persisted.providerSessions[0].synchronizedThroughMessageId).toBe('message-1');
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('rejects concurrent turns for one conversation while allowing separate conversations', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const events = [];
        const conversation = {
            actionId: null, completedAt: null, events: [], id: 'conversation-1', messages: [], providerSessions: [],
            startedAt: 'earlier', status: 'completed', title: 'Agent',
        };

        try {
            await prepareProject(rootPath);
            const first = await service.start(createProject(rootPath), agentRequest({
                command: ['node', '-e', 'setTimeout(()=>process.exit(0),100)'], conversation,
                prompt: 'one', reference: conversationActivityReference('design/activity/project.json', conversation.id), scopePath: 'project',
            }), (event) => events.push(event));

            await expect(service.start(createProject(rootPath), agentRequest({
                command: ['node', '-e', 'process.exit(0)'], conversation,
                prompt: 'two', reference: conversationActivityReference('design/activity/project.json', conversation.id), scopePath: 'project',
            }), () => undefined)).rejects.toThrow('already has a running turn');
            const second = await service.start(createProject(rootPath), agentRequest({command: ['node', '-e', 'process.exit(0)'], prompt: 'other', scopePath: 'project'}), (event) => events.push(event));

            service.stop(first.runId);
            await waitForEventCount(events, 'closed', 2);
            expect(second.reference).not.toBe(first.reference);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('writes final completion atomically before reporting closed', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const service = createService();
        const renameSpy = vi.spyOn(fsPromises, 'rename');

        try {
            await prepareProject(rootPath);
            const result = await service.run(createProject(rootPath), agentRequest({command: ['node', '-e', "process.stdout.write('done')"], prompt: 'go', scopePath: 'project'}), () => undefined);
            const persisted = await readPersistedConversation(rootPath, result.reference);
            const { activityPath } = parseConversationActivityReference(result.reference);

            expect(persisted.status).toBe('completed');
            expect(renameSpy.mock.calls.some(([from, to]) => String(from).endsWith('.tmp') && to === join(rootPath, activityPath))).toBe(true);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    it('uses the injected terminal persistence once before publishing closed', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-runner-'));
        const lifecycle = [];
        const persistTerminalConversation = vi.fn(async (run) => {
            lifecycle.push('persist');
            expect(run.conversation.status).toBe('completed');
        });
        const service = new AgentRunnerService({ persistTerminalConversation });

        try {
            await prepareProject(rootPath);
            await service.run(
                createProject(rootPath),
                agentRequest({command: ['node', '-e', "process.stdout.write('done')"], prompt: 'go', scopePath: 'project'}),
                (event) => lifecycle.push(event.type),
            );

            expect(persistTerminalConversation).toHaveBeenCalledOnce();
            expect(lifecycle.indexOf('persist')).toBeLessThan(lifecycle.indexOf('closed'));
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
