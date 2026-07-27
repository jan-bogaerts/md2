import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { AgentRunnerService } = require('./agent_runner_service');
const TEST_TIMEOUT_MS = 15_000;

async function prepareProject(rootPath) {
    await mkdir(join(rootPath, '.git'));
    await mkdir(join(rootPath, 'design'));
}

function waitFor(events, predicate) {
    const current = events.find(predicate);
    if (current) return Promise.resolve(current);

    return new Promise((resolve) => {
        const interval = setInterval(() => {
            const event = events.find(predicate);
            if (!event) return;
            clearInterval(interval);
            resolve(event);
        }, 5);
    });
}

function request(command) {
    return {
        agent: 'claude',
        command,
        projectFolder: 'design',
        prompt: 'make plan',
        streaming: true,
    };
}

describe('AgentRunnerService streaming lifecycle', () => {
    it('keeps one process across turns, persists boundaries, and completes only after Finish', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-streaming-'));
        const scriptPath = join(rootPath, 'streaming-agent.cjs');
        const persistedStatuses = [];
        const persistConversation = vi.fn(async (run) => {
            persistedStatuses.push(run.conversation.status);
        });
        const service = new AgentRunnerService({ persistConversation });
        const events = [];
        const completion = Promise.withResolvers();

        try {
            await prepareProject(rootPath);
            await writeFile(scriptPath, [
                "const readline=require('node:readline');",
                "let first=true;",
                "const input=readline.createInterface({input:process.stdin});",
                "input.on('line',(line)=>{",
                "const message=JSON.parse(line);",
                "if(first){console.log(JSON.stringify({type:'system',subtype:'init',session_id:'session-1'}));first=false;}",
                "console.log(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:`reply:${message.message.content}`}]}}));",
                "console.log(JSON.stringify({type:'result',usage:{input_tokens:2,output_tokens:1}}));",
                "});",
            ].join(''));
            const started = await service.start(
                { branch: 'main', rootPath },
                request(['node', scriptPath]),
                (event) => events.push(event),
                (exitCode, run) => completion.resolve({ exitCode, run }),
                completion.reject,
            );

            await waitFor(events, (event) => event.type === 'state' && event.state === 'waitingForInput');
            expect(service.processes.has(started.runId)).toBe(true);
            expect(events.filter(({ type }) => type === 'output').map(({ content }) => content).join('')).toContain('reply:make plan');

            service.sendMessage(started.runId, 'approved');
            await waitFor(events, (event) => event.type === 'output' && event.content.includes('reply:approved'));
            await waitFor(events, (event, index) => (
                event.type === 'state'
                && event.state === 'waitingForInput'
                && events.slice(0, index + 1).filter(({ type }) => type === 'state').length >= 3
            ));
            service.finish(started.runId);
            const result = await completion.promise;

            expect(result.exitCode).toBe(0);
            expect(result.run.conversation.status).toBe('completed');
            expect(result.run.conversation.messages.filter(({ role }) => role === 'assistant')).toHaveLength(2);
            expect(persistedStatuses).toContain('waitingForInput');
            expect(persistedStatuses.at(-1)).toBe('completed');
        } finally {
            await service.stopAll();
            await rm(rootPath, { force: true, recursive: true });
        }
    }, TEST_TIMEOUT_MS);

    it('fails when a streaming process exits before Finish', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-agent-streaming-'));
        const service = new AgentRunnerService({ persistConversation: vi.fn(async () => undefined) });
        const completion = Promise.withResolvers();

        try {
            await prepareProject(rootPath);
            await service.start(
                { branch: 'main', rootPath },
                request(['node', '-e', 'process.stdin.resume();process.stdin.once("data",()=>process.exit(0))']),
                () => undefined,
                (exitCode, run) => completion.resolve({ exitCode, run }),
                completion.reject,
            );
            const result = await completion.promise;

            expect(result.exitCode).not.toBe(0);
            expect(result.run.conversation.status).toBe('failed');
            expect(result.run.stderr).toContain('exited before Finish');
        } finally {
            await service.stopAll();
            await rm(rootPath, { force: true, recursive: true });
        }
    }, TEST_TIMEOUT_MS);
});
