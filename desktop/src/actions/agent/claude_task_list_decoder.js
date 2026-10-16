const CLAUDE_TASK_TOOLS = new Set(['TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate']);
const ROOT_STREAM_KEY = 'root';

function streamKey(event) {
    const parentToolUseId = event?.parent_tool_use_id;

    return typeof parentToolUseId === 'string' && parentToolUseId.length > 0 ? parentToolUseId : ROOT_STREAM_KEY;
}

function toolKey(event, toolUseId) {
    return `${streamKey(event)}:${toolUseId}`;
}

function validString(value) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function taskStatus(status) {
    if (status === 'in_progress') return 'inProgress';
    if (status === 'pending' || status === 'completed') return status;

    return null;
}

function isClaudeTaskToolName(name) {
    return CLAUDE_TASK_TOOLS.has(name);
}

class ClaudeTaskListDecoder {
    constructor() {
        this.pendingCreates = new Map();
        this.taskToolUses = new Set();
        this.tasks = new Map();
        this.taskIds = new Map();
    }

    decode(event) {
        if (event.type === 'assistant') return this.decodeToolUses(event);
        if (event.type === 'user') return this.decodeToolResults(event);

        return [];
    }

    decodeToolUses(event) {
        if (!Array.isArray(event.message?.content)) return [];
        const taskListEvents = [];
        for (const block of event.message.content) {
            if (block?.type !== 'tool_use' || !isClaudeTaskToolName(block.name)) continue;
            if (typeof block.id === 'string') this.taskToolUses.add(toolKey(event, block.id));
            if (block.name === 'TaskCreate') this.rememberCreate(event, block);
            if (block.name !== 'TaskUpdate') continue;
            const taskListEvent = this.applyUpdate(event, block.input);
            if (taskListEvent) taskListEvents.push(taskListEvent);
        }

        return taskListEvents;
    }

    rememberCreate(event, block) {
        if (typeof block.id !== 'string' || block.id.length === 0) return;
        const subject = validString(block.input?.subject);
        if (!subject) return;
        const activeForm = validString(block.input?.activeForm);
        const pendingCreate = { subject, ...(activeForm ? { activeForm } : {}), streamKey: streamKey(event) };
        this.pendingCreates.set(toolKey(event, block.id), pendingCreate);
    }

    decodeToolResults(event) {
        if (!Array.isArray(event.message?.content)) return [];
        const resultBlocks = event.message.content.filter((block) => block?.type === 'tool_result');
        const appliedResult = resultBlocks.length === 1 ? event.tool_use_result : null;

        return resultBlocks
            .map((block) => this.applyCreateResult(event, block, appliedResult))
            .filter((taskListEvent) => taskListEvent !== null);
    }

    applyCreateResult(event, block, appliedResult) {
        if (typeof block.tool_use_id !== 'string') return null;
        const pendingKey = toolKey(event, block.tool_use_id);
        const pendingCreate = this.pendingCreates.get(pendingKey);
        if (!pendingCreate) return null;
        this.pendingCreates.delete(pendingKey);
        if (block.is_error === true) return null;
        const taskId = validString(appliedResult?.task?.id);
        if (!taskId) return null;
        const displayedId = this.resolveCreatedTaskId(taskId, pendingCreate.streamKey);
        const task = {
            ...(pendingCreate.activeForm ? { activeForm: pendingCreate.activeForm } : {}),
            id: displayedId,
            status: 'pending',
            subject: pendingCreate.subject,
        };
        this.tasks.set(displayedId, task);

        return this.taskListEvent();
    }

    resolveCreatedTaskId(taskId, owner) {
        const taskReference = `${owner}:${taskId}`;
        const knownId = this.taskIds.get(taskReference);
        if (knownId) return knownId;
        const collisions = [...this.taskIds.entries()].filter(([reference]) => reference.endsWith(`:${taskId}`));
        if (collisions.length === 0) {
            this.taskIds.set(taskReference, taskId);
            return taskId;
        }
        for (const [reference, displayedId] of collisions) {
            if (displayedId !== taskId) continue;
            const separatorIndex = reference.indexOf(':');
            const existingOwner = reference.slice(0, separatorIndex);
            if (existingOwner === ROOT_STREAM_KEY) continue;
            const namespacedId = `${existingOwner}:${taskId}`;
            const existingTask = this.tasks.get(taskId);
            this.tasks.delete(taskId);
            if (existingTask) this.tasks.set(namespacedId, { ...existingTask, id: namespacedId });
            this.taskIds.set(reference, namespacedId);
        }
        const displayedId = owner === ROOT_STREAM_KEY ? taskId : `${owner}:${taskId}`;
        this.taskIds.set(taskReference, displayedId);

        return displayedId;
    }

    applyUpdate(event, input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
        const rawTaskId = validString(input.taskId) ?? validString(input.id) ?? validString(input.task_id);
        if (!rawTaskId) return null;
        const owner = streamKey(event);
        const taskReference = this.resolveTaskReference(rawTaskId, owner);
        const displayedId = taskReference ? this.taskIds.get(taskReference) : null;
        const task = displayedId ? this.tasks.get(displayedId) : null;
        if (!task) {
            console.warn('[agent:claude-task-list]', `Unknown Claude task id: ${rawTaskId}`);
            return null;
        }
        if (input.status === 'deleted') {
            this.tasks.delete(displayedId);
            this.taskIds.delete(taskReference);
            return this.taskListEvent();
        }
        const status = input.status === undefined ? task.status : taskStatus(input.status);
        if (!status) return null;
        const subject = input.subject === undefined ? task.subject : validString(input.subject);
        if (!subject) return null;
        const activeForm = input.activeForm === undefined ? task.activeForm : validString(input.activeForm);
        const updatedTask = {
            ...(activeForm ? { activeForm } : {}),
            id: displayedId,
            status,
            subject,
        };
        this.tasks.set(displayedId, updatedTask);

        return this.taskListEvent();
    }

    resolveTaskReference(taskId, owner) {
        const ownedReference = `${owner}:${taskId}`;
        if (this.taskIds.has(ownedReference)) return ownedReference;
        const matches = [...this.taskIds.keys()].filter((reference) => reference.endsWith(`:${taskId}`));

        return matches.length === 1 ? matches[0] : null;
    }

    isTaskToolResult(event, block) {
        return block?.type === 'tool_result'
            && typeof block.tool_use_id === 'string'
            && this.taskToolUses.has(toolKey(event, block.tool_use_id));
    }

    taskListEvent() {
        const taskList = { tasks: [...this.tasks.values()].map((task) => ({ ...task })), updatedAt: new Date().toISOString() };

        return { taskList, type: 'taskList' };
    }

    /** Clear per-turn tool correlation while retaining Claude session task state. */
    reset() {
        this.pendingCreates.clear();
        this.taskToolUses.clear();
    }
}

module.exports = { ClaudeTaskListDecoder, isClaudeTaskToolName };
