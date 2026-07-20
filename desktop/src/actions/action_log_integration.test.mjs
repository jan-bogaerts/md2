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

describe('action activity integration', () => {
    it('writes terminal conversation and root record together under stable card activity', async () => {
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
                localGitService: {
                    ...localGitService,
                    appendAndCommitActionActivity: (activityProject, activityProjectFolder, origin, record) => (
                        localGitService.appendActionActivity(activityProject, activityProjectFolder, origin, record)
                    ),
                    upsertAndCommitActivityConversation: (activityProject, activityProjectFolder, origin, conversation) => (
                        localGitService.upsertActivityConversation(activityProject, activityProjectFolder, origin, conversation)
                    ),
                },
            });
            runner.startProject(project, actionsFolder, projectFolder);

            const executionId = await runner.start({
                actionId: 'review.card',
                context: { cardInternalId: 'card-1', file: `${projectFolder}/active/F-1 Test.md`, kind: 'card' },
                runInput: {},
            });
            await expect(runner.wait(executionId)).resolves.toMatchObject({ status: 'completed' });

            const activityFolder = join(rootPath, projectFolder, 'activity');
            expect(await readdir(activityFolder)).toEqual(['card__card-1.json']);
            const activity = JSON.parse(await readFile(join(activityFolder, 'card__card-1.json'), 'utf8'));
            expect(activity.conversations).toEqual([expect.objectContaining({actionId: 'review.card', cardInternalId: 'card-1', status: 'completed'})]);
            expect(activity.records).toEqual([expect.objectContaining({
                conversationIds: [activity.conversations[0].id],
                history: expect.objectContaining({ output: 'done', status: 'completed' }),
                rootActionId: 'review.card',
            })]);
        } finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});
