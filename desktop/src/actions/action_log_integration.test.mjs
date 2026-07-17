import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { ActionRunnerService } = require('./action_runner_service');
const { ActionWorktreeExecutionService } = require('./action_worktree_execution_service');
const { AgentRunnerService } = require('./agent_runner_service');
const localGitService = require('../git/local_git_service');

describe('action log integration', () => {
    it('writes conversation and history records together under nested project logs', async () => {
        const rootPath = await mkdtemp(join(tmpdir(), 'md2-action-log-worktree-'));
        const projectFolder = 'projects/demo';
        const actionsFolder = `${projectFolder}/actions`;
        const scriptPath = join(rootPath, 'agent.cjs');
        const project = { branch: 'feature', id: rootPath, rootPath };

        try {
            await mkdir(join(rootPath, '.git'));
            await mkdir(join(rootPath, actionsFolder), { recursive: true });
            await writeFile(join(rootPath, actionsFolder, 'review.json'), JSON.stringify({
                agent: 'codex',
                description: 'Review card',
                id: 'review.card',
                label: 'Review',
                model: 'gpt-5',
                prompt: 'Review {{card-file}}',
                type: 'agent',
            }));
            await writeFile(scriptPath, [
                "console.log(JSON.stringify({type:'thread.started',thread_id:'thread-1'}))",
                "console.log(JSON.stringify({type:'turn.started'}))",
                "console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'done'}}))",
            ].join(';'));
            const runner = new ActionRunnerService({
                actionWorktreeExecutionService: new ActionWorktreeExecutionService({ worktreeService: {} }),
                agentConfigProvider: () => ({
                    agent: 'codex',
                    agentProfiles: [{ command: ['node', scriptPath], models: ['gpt-5'], name: 'codex' }],
                    model: 'gpt-5',
                }),
                agentRunnerService: new AgentRunnerService(),
                localGitService,
            });
            runner.startProject(project, actionsFolder, projectFolder);

            const executionId = await runner.start({
                actionId: 'review.card',
                context: { file: `${projectFolder}/active/F-1 Test.md`, kind: 'card' },
                runInput: {},
            });
            await expect(runner.wait(executionId)).resolves.toMatchObject({ status: 'completed' });

            const logFolder = join(rootPath, projectFolder, 'logs');
            const files = await readdir(logFolder);
            const conversationFile = files.find((file) => file.startsWith('conversation__'));
            expect(files).toContain('history__card__active_f_1_test__review_card.json');
            expect(conversationFile).toMatch(/^conversation__card__active_f_1_test__agent_[a-z0-9_]+\.json$/u);
            const conversation = JSON.parse(await readFile(join(logFolder, conversationFile), 'utf8'));
            const history = JSON.parse(await readFile(join(logFolder, 'history__card__active_f_1_test__review_card.json'), 'utf8'));
            expect(conversation).toMatchObject({ actionId: 'review.card', cardPath: `${projectFolder}/active/F-1 Test.md`, status: 'completed' });
            expect(history).toEqual([expect.objectContaining({ output: 'done', status: 'completed' })]);
            await expect(readdir(join(rootPath, '.md2-agent-logs'))).rejects.toThrow();
            await expect(readdir(join(rootPath, actionsFolder, '.md2-action-history'))).rejects.toThrow();
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
