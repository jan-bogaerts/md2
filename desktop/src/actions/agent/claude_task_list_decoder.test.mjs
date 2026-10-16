import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { ClaudeTaskListDecoder } = require('./claude_task_list_decoder');
const UPDATED_AT = '2026-10-16T10:00:00.000Z';

function assistant(content, parentToolUseId = null) {
    return {
        message: { content },
        ...(parentToolUseId ? { parent_tool_use_id: parentToolUseId } : {}),
        type: 'assistant',
    };
}

function toolResult(toolUseId, taskId, options = {}) {
    return {
        message: { content: [{ is_error: options.isError, tool_use_id: toolUseId, type: 'tool_result' }] },
        ...(options.parentToolUseId ? { parent_tool_use_id: options.parentToolUseId } : {}),
        tool_use_result: { task: { id: taskId } },
        type: 'user',
    };
}

function taskCreate(id, subject, activeForm) {
    return { id, input: { activeForm, subject }, name: 'TaskCreate', type: 'tool_use' };
}

function taskUpdate(id, input) {
    return { id, input, name: 'TaskUpdate', type: 'tool_use' };
}

describe('ClaudeTaskListDecoder', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('emits full lists for create, update, complete, and delete', () => {
        vi.useFakeTimers();
        vi.setSystemTime(UPDATED_AT);
        const decoder = new ClaudeTaskListDecoder();

        expect(decoder.decode(assistant([taskCreate('create-1', 'Build decoder', 'Building decoder')]))).toEqual([]);
        expect(decoder.decode(toolResult('create-1', '1'))).toEqual([{
            taskList: {
                tasks: [{ activeForm: 'Building decoder', id: '1', status: 'pending', subject: 'Build decoder' }],
                updatedAt: UPDATED_AT,
            },
            type: 'taskList',
        }]);
        expect(decoder.decode(assistant([taskUpdate('update-1', {activeForm: 'Implementing decoder', status: 'in_progress', subject: 'Implement decoder', taskId: '1'})]))[0].taskList.tasks).toEqual([
            { activeForm: 'Implementing decoder', id: '1', status: 'inProgress', subject: 'Implement decoder' },
        ]);
        expect(decoder.decode(assistant([taskUpdate('update-2', { id: '1', status: 'completed' })]))[0].taskList.tasks[0].status)
            .toBe('completed');
        expect(decoder.decode(assistant([taskUpdate('update-3', { status: 'deleted', task_id: '1' })]))[0].taskList.tasks)
            .toEqual([]);
    });

    it('ignores failed creates and logs updates received before create results', () => {
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const decoder = new ClaudeTaskListDecoder();

        decoder.decode(assistant([taskCreate('create-failed', 'Failed task', 'Failing task')]));
        expect(decoder.decode(toolResult('create-failed', '1', { isError: true }))).toEqual([]);
        expect(decoder.decode(assistant([taskUpdate('update-early', { status: 'completed', taskId: '1' })]))).toEqual([]);

        expect(warning).toHaveBeenCalledWith('[agent:claude-task-list]', 'Unknown Claude task id: 1');
    });

    it('merges sub-agent tasks and namespaces colliding ids by parent tool use id', () => {
        const decoder = new ClaudeTaskListDecoder();

        decoder.decode(assistant([taskCreate('create-root', 'Root task', 'Root working')]));
        decoder.decode(toolResult('create-root', '1'));
        decoder.decode(assistant([taskCreate('create-child', 'Child task', 'Child working')], 'agent-1'));
        const [created] = decoder.decode(toolResult('create-child', '1', { parentToolUseId: 'agent-1' }));

        expect(created.taskList.tasks).toEqual([
            { activeForm: 'Root working', id: '1', status: 'pending', subject: 'Root task' },
            { activeForm: 'Child working', id: 'agent-1:1', status: 'pending', subject: 'Child task' },
        ]);
        const [updated] = decoder.decode(assistant([
            taskUpdate('update-child', { status: 'in_progress', taskId: '1' }),
        ], 'agent-1'));
        expect(updated.taskList.tasks[1].status).toBe('inProgress');
    });

    it('lets a sub agent update a uniquely identified session task', () => {
        const decoder = new ClaudeTaskListDecoder();

        decoder.decode(assistant([taskCreate('create-root', 'Shared task', 'Working')]));
        decoder.decode(toolResult('create-root', '1'));
        const [updated] = decoder.decode(assistant([
            taskUpdate('update-child', { status: 'completed', taskId: '1' }),
        ], 'agent-1'));

        expect(updated.taskList.tasks).toEqual([
            { activeForm: 'Working', id: '1', status: 'completed', subject: 'Shared task' },
        ]);
    });

    it('hides task results and resets only per-turn correlation', () => {
        const decoder = new ClaudeTaskListDecoder();
        const createEvent = assistant([taskCreate('create-1', 'Task', 'Working')]);
        const resultEvent = toolResult('create-1', '1');

        decoder.decode(createEvent);
        expect(decoder.isTaskToolResult(resultEvent, resultEvent.message.content[0])).toBe(true);
        decoder.decode(resultEvent);
        decoder.reset();
        expect(decoder.isTaskToolResult(resultEvent, resultEvent.message.content[0])).toBe(false);
        expect(decoder.decode(assistant([taskUpdate('update-1', { status: 'completed', taskId: '1' })]))[0].taskList.tasks[0].status)
            .toBe('completed');
    });
});
