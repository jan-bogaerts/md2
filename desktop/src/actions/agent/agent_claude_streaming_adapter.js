const { normalizedContent } = require('./agent_event_utils');
const { claudeChangedPaths, claudeUsage } = require('./agent_claude_events');
const { isMissingSession } = require('./agent_provider_protocol');

const CLAUDE_APPROVAL_DECISIONS = ['accept', 'acceptForSession', 'decline', 'cancel'];
const CLAUDE_FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit', 'Write']);
const CLAUDE_QUESTION_TOOL = 'AskUserQuestion';

function requireMessage(content) {
    if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Streaming agent message is required');

    return content;
}

function claudeUserMessage(content) {
    return { message: { content, role: 'user' }, type: 'user' };
}

function claudeControlResponse(requestId, response) {
    return {
        response: { request_id: requestId, response, subtype: 'success' },
        type: 'control_response',
    };
}

function claudeQuestionRequest(event) {
    if (event.type !== 'control_request' || event.request?.subtype !== 'can_use_tool') return null;
    if (event.request.tool_name !== CLAUDE_QUESTION_TOOL || !Array.isArray(event.request.input?.questions)) return null;

    const questions = event.request.input.questions.map((question, index) => ({
        ...question,
        id: question.id ?? `claude-question-${index}`,
    }));

    return {
        input: event.request.input,
        questions,
        requestId: event.request_id,
        toolUseId: event.request.tool_use_id,
    };
}

function approvalFilePaths(toolName, input) {
    if (!CLAUDE_FILE_TOOLS.has(toolName) || !input || typeof input !== 'object' || Array.isArray(input)) return [];
    const filePath = toolName === 'NotebookEdit' ? input.notebook_path : input.file_path;

    return typeof filePath === 'string' && filePath.length > 0 ? [filePath] : [];
}

function claudeApprovalRequest(event) {
    if (event.type !== 'control_request' || event.request?.subtype !== 'can_use_tool') return null;
    if (event.request.tool_name === CLAUDE_QUESTION_TOOL) return null;
    const { input, permission_suggestions: permissionSuggestions, tool_name: toolName, tool_use_id: toolUseId } = event.request;
    if (event.request_id === undefined || event.request_id === null) throw new Error('Missing Claude approval request id');
    if (typeof toolName !== 'string' || toolName.length === 0) throw new Error('Missing Claude approval tool name');
    if (typeof toolUseId !== 'string' || toolUseId.length === 0) throw new Error('Missing Claude approval tool use id');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Missing Claude approval input');
    if (permissionSuggestions !== undefined && !Array.isArray(permissionSuggestions)) {
        throw new Error('Invalid Claude approval permission suggestions');
    }
    const availableDecisions = permissionSuggestions?.length > 0
        ? CLAUDE_APPROVAL_DECISIONS
        : CLAUDE_APPROVAL_DECISIONS.filter((decision) => decision !== 'acceptForSession');
    const approval = {
        approvalId: toolUseId,
        availableDecisions,
        command: toolName === 'Bash' && typeof input.command === 'string' ? input.command : null,
        cwd: typeof input.cwd === 'string' ? input.cwd : null,
        filePaths: approvalFilePaths(toolName, input),
        input: structuredClone(input),
        itemId: toolUseId,
        kind: toolName === 'Bash' ? 'commandExecution' : CLAUDE_FILE_TOOLS.has(toolName) ? 'fileChange' : 'toolUse',
        permissionSuggestions: structuredClone(permissionSuggestions ?? []),
        provider: 'claude',
        reason: event.request.decision_reason ?? event.request.reason ?? null,
        requestId: event.request_id,
        startedAtMs: Date.now(),
        toolName,
    };

    return { approval, input, permissionSuggestions: permissionSuggestions ?? [], toolUseId };
}

function claudeApprovalResponse(pendingApproval, decision) {
    const { input, permissionSuggestions, toolUseId } = pendingApproval;
    if (decision === 'accept') return { behavior: 'allow', toolUseID: toolUseId, updatedInput: input };
    if (decision === 'acceptForSession') {
        return {
            behavior: 'allow',
            toolUseID: toolUseId,
            updatedInput: input,
            updatedPermissions: permissionSuggestions,
        };
    }
    if (decision === 'decline') {
        return { behavior: 'deny', message: 'User declined this tool request', toolUseID: toolUseId };
    }

    return { behavior: 'deny', interrupt: true, message: 'User stopped the turn', toolUseID: toolUseId };
}

function isClaudeMissingSessionResult(event, providerConversationId) {
    if (!providerConversationId || event.type !== 'result' || event.is_error !== true) return false;
    if (event.session_id !== providerConversationId || !Array.isArray(event.errors)) return false;

    return event.errors.includes(`No conversation found with session ID: ${providerConversationId}`);
}

function eventBase(providerItemId, type, label, status = 'inProgress') {
    return { content: '', label, providerItemId, status, type };
}

function toolInputContent(input) {
    if (typeof input === 'string') return input;

    return JSON.stringify(input ?? {});
}

function claudeToolEvent(block, status = 'inProgress', providerItemId = block.id) {
    const base = eventBase(providerItemId, `tool.${block.name}`, block.name, status);
    if (block.name === 'Bash') {
        return {
            ...base,
            command: block.input?.command,
            content: block.input?.command ?? toolInputContent(block.input),
            label: block.input?.command ?? 'Bash',
            type: 'commandExecution',
            workingDirectory: block.input?.cwd,
        };
    }
    if (CLAUDE_FILE_TOOLS.has(block.name)) {
        const filePaths = approvalFilePaths(block.name, block.input);
        const content = typeof block.input === 'string' ? block.input : filePaths.join('\n');

        return { ...base, content, label: block.name, type: 'fileChange' };
    }

    return { ...base, content: toolInputContent(block.input) };
}

class ClaudeStreamingAdapter {
    constructor(writeLine, onEvent, rootPath, providerConversationId) {
        this.writeLine = writeLine;
        this.onEvent = onEvent;
        this.pendingApprovals = new Map();
        this.pendingQuestions = new Map();
        this.providerConversationId = providerConversationId;
        this.rootPath = rootPath;
        this.activeBlocks = new Map();
        this.streamedTextItems = new Map();
        this.activeMessageId = null;
        this.protocolErrorSequence = 1;
        this.turnStarted = false;
        this.turnHasAssistantText = false;
    }

    async start(prompt) {
        await this.sendMessage(prompt);
    }

    async sendMessage(content) {
        await this.writeLine(claudeUserMessage(requireMessage(content)));
    }

    async answerQuestion(requestId, answers) {
        const pendingQuestion = this.pendingQuestions.get(requestId);
        if (!pendingQuestion) throw new Error(`Unknown Claude question request id: ${requestId}`);
        const mappedAnswers = Object.fromEntries(pendingQuestion.questions.map(({ id, question }) => {
            if (!Object.hasOwn(answers, id)) throw new Error(`Missing answer for Claude question: ${id}`);

            return [question, answers[id]];
        }));
        const updatedInput = { ...pendingQuestion.input, answers: mappedAnswers };
        const response = { behavior: 'allow', toolUseID: pendingQuestion.toolUseId, updatedInput };
        await this.writeLine(claudeControlResponse(requestId, response));
        this.pendingQuestions.delete(requestId);
    }

    async answerApproval(requestId, decision) {
        const pendingApproval = this.pendingApprovals.get(requestId);
        if (!pendingApproval) throw new Error(`Unknown or stale Claude approval request id: ${requestId}`);
        if (pendingApproval.submitted) throw new Error(`Claude approval request was already submitted: ${requestId}`);
        if (!pendingApproval.approval.availableDecisions.includes(decision)) {
            throw new Error(`Unsupported Claude approval decision for request ${requestId}`);
        }
        const response = claudeApprovalResponse(pendingApproval, decision);
        pendingApproval.submitted = true;
        try {
            await this.writeLine(claudeControlResponse(requestId, response));
        } catch (error) {
            pendingApproval.submitted = false;
            throw error;
        }
        await this.onEvent({ requestId, type: 'approvalSubmitted' });
        this.pendingApprovals.delete(requestId);
        await this.onEvent({ requestId, type: 'approvalResolved' });
    }

    async handleMessage(event) {
        const questionRequest = claudeQuestionRequest(event);
        if (questionRequest) {
            this.pendingQuestions.set(questionRequest.requestId, questionRequest);
            await this.onEvent({
                questions: questionRequest.questions,
                requestId: questionRequest.requestId,
                type: 'question',
            });
            return;
        }
        const approvalRequest = claudeApprovalRequest(event);
        if (approvalRequest) {
            if (this.pendingApprovals.has(approvalRequest.approval.requestId)) {
                throw new Error(`Duplicate Claude approval request id: ${approvalRequest.approval.requestId}`);
            }
            this.pendingApprovals.set(approvalRequest.approval.requestId, { ...approvalRequest, submitted: false });
            await this.onEvent({ approval: approvalRequest.approval, type: 'approval' });
            return;
        }
        if (event.type === 'control_request' && event.request?.subtype === 'can_use_tool') {
            throw new Error('Invalid Claude question request');
        }
        if (event.type === 'system' && typeof event.session_id === 'string') {
            await this.onEvent({ conversationId: event.session_id, type: 'sessionStarted' });
        }
        if (event.type === 'system') {
            if (event.subtype !== 'init') ClaudeStreamingAdapter.ignoreProtocolNoise();
            return;
        }
        if (event.type === 'stream_event') {
            await this.handleStreamEvent(event.event);
            return;
        }
        if (event.type === 'assistant') {
            await this.handleAssistantCompletion(event);
            return;
        }
        if (event.type === 'user') {
            await this.ensureTurnStarted();
            await this.handleToolResults(event);
            return;
        }
        if (event.type === 'result') {
            await this.handleResult(event);
            return;
        }
        ClaudeStreamingAdapter.ignoreProtocolNoise();
    }

    async ensureTurnStarted() {
        if (this.turnStarted) return;
        this.turnStarted = true;
        await this.onEvent({ type: 'turnStarted' });
    }

    async handleStreamEvent(streamEvent) {
        if (!streamEvent || typeof streamEvent.type !== 'string') {
            await this.emitProtocolError('invalid stream event');
            return;
        }
        if (streamEvent.type === 'message_start') {
            await this.ensureTurnStarted();
            this.activeMessageId = streamEvent.message?.id;
            this.activeBlocks.clear();
            if (typeof this.activeMessageId !== 'string' || this.activeMessageId.length === 0) {
                await this.emitProtocolError('message_start missing message id');
            }
            return;
        }
        if (streamEvent.type === 'content_block_start') {
            await this.handleContentBlockStart(streamEvent);
            return;
        }
        if (streamEvent.type === 'content_block_delta') {
            await this.handleContentBlockDelta(streamEvent);
            return;
        }
        if (streamEvent.type === 'content_block_stop' || streamEvent.type === 'message_delta' || streamEvent.type === 'message_stop') return;
        ClaudeStreamingAdapter.ignoreProtocolNoise();
    }

    async handleContentBlockStart(streamEvent) {
        const validBlock = !!streamEvent.content_block
            && typeof streamEvent.content_block === 'object'
            && !Array.isArray(streamEvent.content_block);
        if (!Number.isSafeInteger(streamEvent.index) || !validBlock || typeof this.activeMessageId !== 'string' || this.activeMessageId.length === 0) {
            await this.emitProtocolError('invalid content_block_start');
            return;
        }
        const block = structuredClone(streamEvent.content_block);
        const providerItemId = block.id ?? `${this.activeMessageId}:${block.type}:${streamEvent.index}`;
        const separator = block.type === 'text' && this.turnHasAssistantText ? '\n\n' : '';
        const trackedBlock = { block, inputJson: '', providerItemId, separator, text: block.text ?? block.thinking ?? '' };
        this.activeBlocks.set(streamEvent.index, trackedBlock);
        if (block.type === 'text') {
            // Keyed by stable providerItemId so the later aggregated `assistant` message reconciles
            // even after `message_start` of the next step has cleared `activeBlocks`.
            this.streamedTextItems.set(providerItemId, { separator });
            await this.onEvent({ itemId: providerItemId, type: 'assistantStarted' });
            if (separator.length > 0) await this.onEvent({ content: separator, itemId: providerItemId, type: 'assistant' });
            return;
        }
        if (block.type === 'thinking') {
            const event = {
                ...eventBase(providerItemId, 'reasoning', 'Thinking'),
                content: trackedBlock.text,
                details: [trackedBlock.text],
                summary: [],
            };
            await this.onEvent({ event, type: 'event' });
            return;
        }
        if (block.type === 'tool_use') await this.onEvent({ event: claudeToolEvent(block, 'inProgress', providerItemId), type: 'event' });
    }

    async handleContentBlockDelta(streamEvent) {
        const trackedBlock = this.activeBlocks.get(streamEvent.index);
        if (!trackedBlock || !streamEvent.delta || typeof streamEvent.delta.type !== 'string') {
            await this.emitProtocolError('invalid content_block_delta');
            return;
        }
        const { delta } = streamEvent;
        if (delta.type === 'text_delta' && typeof delta.text === 'string' && trackedBlock.block.type === 'text') {
            trackedBlock.text += delta.text;
            this.turnHasAssistantText = this.turnHasAssistantText || delta.text.length > 0;
            await this.onEvent({ content: delta.text, itemId: trackedBlock.providerItemId, type: 'assistant' });
            return;
        }
        if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string' && trackedBlock.block.type === 'thinking') {
            trackedBlock.text += delta.thinking;
            const event = {
                ...eventBase(trackedBlock.providerItemId, 'reasoning', 'Thinking'),
                content: trackedBlock.text,
                details: [trackedBlock.text],
                summary: [],
            };
            await this.onEvent({ event, type: 'event' });
            return;
        }
        if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string' && trackedBlock.block.type === 'tool_use') {
            trackedBlock.inputJson += delta.partial_json;
            const updatedBlock = { ...trackedBlock.block, input: trackedBlock.inputJson };
            await this.onEvent({ event: claudeToolEvent(updatedBlock, 'inProgress', trackedBlock.providerItemId), type: 'event' });
            return;
        }
        if (delta.type !== 'signature_delta') ClaudeStreamingAdapter.ignoreProtocolNoise();
    }

    async handleAssistantCompletion(event) {
        await this.ensureTurnStarted();
        if (!Array.isArray(event.message?.content)) {
            await this.emitProtocolError('assistant message missing content');
            return;
        }
        const messageId = event.message.id ?? this.activeMessageId;
        if (typeof messageId !== 'string' || messageId.length === 0) throw new Error('Missing Claude assistant message id');
        for (const [index, block] of event.message.content.entries()) {
            const providerItemId = block.id ?? `${messageId}:${block.type}:${index}`;
            if (block.type === 'text' && typeof block.text === 'string') {
                const streamedItem = this.streamedTextItems.get(providerItemId);
                const separator = streamedItem?.separator ?? (this.turnHasAssistantText ? '\n\n' : '');
                if (!streamedItem) {
                    await this.onEvent({ itemId: providerItemId, type: 'assistantStarted' });
                }
                this.turnHasAssistantText = this.turnHasAssistantText || block.text.length > 0;
                await this.onEvent({ content: `${separator}${block.text}`, itemId: providerItemId, type: 'assistantCompleted' });
                continue;
            }
            if (block.type === 'thinking') {
                const content = typeof block.thinking === 'string' ? block.thinking : '';
                const reasoningEvent = {
                    ...eventBase(providerItemId, 'reasoning', 'Thinking', 'completed'),
                    content,
                    details: [content],
                    summary: [],
                };
                await this.onEvent({ event: reasoningEvent, type: 'event' });
                continue;
            }
            if (block.type === 'tool_use') await this.onEvent({ event: claudeToolEvent(block, 'inProgress', providerItemId), type: 'event' });
        }
        const changedPaths = claudeChangedPaths(event, this.rootPath);
        if (changedPaths.length > 0) await this.onEvent({ paths: changedPaths, type: 'changedPaths' });
    }

    async handleToolResults(event) {
        if (!Array.isArray(event.message?.content)) return;
        for (const block of event.message.content) {
            if (block?.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue;
            const trackedTool = [...this.activeBlocks.values()].find(({ providerItemId }) => providerItemId === block.tool_use_id);
            const toolEvent = trackedTool?.block?.type === 'tool_use'
                ? claudeToolEvent(trackedTool.block, block.is_error ? 'failed' : 'completed')
                : eventBase(block.tool_use_id, 'tool.result', 'Tool result', block.is_error ? 'failed' : 'completed');
            toolEvent.output = normalizedContent(block.content) ?? '';
            await this.onEvent({ event: toolEvent, type: 'event' });
        }
    }

    async handleResult(event) {
        const error = event.is_error === true
            ? String(event.error ?? event.result ?? event.message ?? event.errors?.join('\n') ?? 'Claude turn failed')
            : null;
        const missingSession = !this.turnStarted && (
            isClaudeMissingSessionResult(event, this.providerConversationId)
            || isMissingSession('claude', event, this.turnStarted)
        );
        for (const requestId of this.pendingApprovals.keys()) {
            this.pendingApprovals.delete(requestId);
            await this.onEvent({ requestId, type: 'approvalResolved' });
        }
        this.activeBlocks.clear();
        this.streamedTextItems.clear();
        this.activeMessageId = null;
        this.pendingQuestions.clear();
        this.turnStarted = false;
        this.turnHasAssistantText = false;
        await this.onEvent({ error, missingSession, type: 'turnCompleted', usage: claudeUsage(event) });
    }

    static ignoreProtocolNoise() {
        // Valid protocol additions need no user-facing event until adapter support exists.
    }

    async emitProtocolError(content) {
        const providerItemId = `error:${this.activeMessageId ?? 'unknown-message'}:${this.protocolErrorSequence}`;
        this.protocolErrorSequence += 1;
        const event = { ...eventBase(providerItemId, 'error', 'Claude protocol error', 'failed'), content };
        await this.onEvent({ event, type: 'event' });
    }
}

module.exports = { ClaudeStreamingAdapter };
