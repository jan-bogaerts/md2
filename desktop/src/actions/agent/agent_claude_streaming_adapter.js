const { normalizedContent } = require('./agent_event_utils');
const { boundedAgentResult } = require('../../../../shared/agent_conversations.mjs');
const {
    ClaudeFileResultDecoder,
    accumulatedClaudeUsage,
    claudeUsage,
    recordClaudeAssistantUsage,
} = require('./agent_claude_events');
const { isMissingSession } = require('./agent_provider_protocol');

const CLAUDE_APPROVAL_DECISIONS = ['accept', 'acceptForSession', 'decline', 'cancel'];
const CLAUDE_CONTEXT_USAGE_TIMEOUT_MS = 1_000;
const CLAUDE_FILE_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit', 'Write']);
const CLAUDE_QUESTION_TOOL = 'AskUserQuestion';
const CLAUDE_SUB_AGENT_TOOL = 'Agent';
const CLAUDE_SUB_AGENT_MESSAGE_TYPE = 'agentMessage';
const DEFAULT_SUB_AGENT_LABEL = 'Sub agent';

function requireMessage(content) {
    if (typeof content !== 'string' || content.trim().length === 0) throw new Error('Streaming agent message is required');

    return content;
}

/**
 * Claude stamps every frame produced by a sub agent with the id of the `Agent` tool call that
 * spawned it. That id is the stream key: the main agent owns the `null` key, each sub agent owns
 * its own, and a sub agent spawned by a sub agent owns the id of the nested `Agent` call.
 */
function claudeStreamKey(value) {
    const parentToolUseId = value?.parent_tool_use_id;

    return typeof parentToolUseId === 'string' && parentToolUseId.length > 0 ? parentToolUseId : null;
}

/** Generated ids are only unique within one stream, so the owning stream key namespaces them. */
function namespacedItemId(streamKey, itemId) {
    return streamKey ? `${streamKey}:${itemId}` : itemId;
}

function claudeSubAgentLabel(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const { description, subagent_type: subagentType } = input;
    if (typeof subagentType === 'string' && subagentType.length > 0) return subagentType;

    return typeof description === 'string' && description.length > 0 ? description : null;
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

function claudeContextUsageRequest(requestId) {
    return {
        request: { subtype: 'get_context_usage' },
        request_id: requestId,
        type: 'control_request',
    };
}

function claudeContextWindowUsage(event) {
    const response = event.response;
    if (!response || typeof response !== 'object' || Array.isArray(response) || response.subtype !== 'success') return null;
    const contextUsage = response.response;
    if (!contextUsage || typeof contextUsage !== 'object' || Array.isArray(contextUsage)) return null;
    const { maxTokens, totalTokens } = contextUsage;
    if (!Number.isSafeInteger(totalTokens) || totalTokens < 0) return null;
    if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0) return null;

    return { capacityTokens: maxTokens, usedTokens: totalTokens };
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

/**
 * Returns `{ error }` rather than throwing for a malformed request: sub agents put frame shapes on
 * this path that md2 has never seen, and a throw here ends the whole conversation.
 */
function claudeApprovalRequest(event, subAgentLabels) {
    if (event.type !== 'control_request' || event.request?.subtype !== 'can_use_tool') return null;
    if (event.request.tool_name === CLAUDE_QUESTION_TOOL) return null;
    const { input, permission_suggestions: permissionSuggestions, tool_name: toolName, tool_use_id: toolUseId } = event.request;
    const parentItemId = claudeStreamKey(event.request) ?? claudeStreamKey(event);
    if (event.request_id === undefined || event.request_id === null) {
        return { error: 'missing Claude approval request id', streamKey: parentItemId };
    }
    if (typeof toolName !== 'string' || toolName.length === 0) {
        return { error: 'missing Claude approval tool name', streamKey: parentItemId };
    }
    if (typeof toolUseId !== 'string' || toolUseId.length === 0) {
        return { error: 'missing Claude approval tool use id', streamKey: parentItemId };
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return { error: 'missing Claude approval input', streamKey: parentItemId };
    }
    if (permissionSuggestions !== undefined && !Array.isArray(permissionSuggestions)) {
        return { error: 'invalid Claude approval permission suggestions', streamKey: parentItemId };
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
        ...(parentItemId ? { parentItemId } : {}),
        permissionSuggestions: structuredClone(permissionSuggestions ?? []),
        provider: 'claude',
        reason: event.request.decision_reason ?? event.request.reason ?? null,
        requestId: event.request_id,
        startedAtMs: Date.now(),
        ...(parentItemId ? { subAgentLabel: subAgentLabels.get(parentItemId) ?? DEFAULT_SUB_AGENT_LABEL } : {}),
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

/** Sub-agent activity carries the spawning `Agent` tool-use id so the transcript can nest it. */
function ownedEvent(event, streamKey) {
    return streamKey ? { ...event, parentItemId: streamKey } : event;
}

function toolInputContent(input) {
    if (typeof input === 'string') return input;

    return JSON.stringify(input ?? {});
}

// Text blocks carry no provider id, so they are keyed by a per-message text ordinal instead of the raw
// content-block index. The ordinal is index-independent, so a leading thinking/tool block shifting the
// aggregated array does not break the streamed↔aggregated reconciliation across an `AskUserQuestion` pause.
function claudeTextItemId(messageId, textOrdinal) {
    return `${messageId}:text:${textOrdinal}`;
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

function createStreamState() {
    return { activeBlocks: new Map(), activeMessageId: null, activeTextOrdinal: 0, turnHasAssistantText: false };
}

class ClaudeStreamingAdapter {
    constructor(writeLine, onEvent, rootPath, providerConversationId) {
        this.writeLine = writeLine;
        this.onEvent = onEvent;
        this.pendingApprovals = new Map();
        this.pendingQuestions = new Map();
        this.providerConversationId = providerConversationId;
        this.rootPath = rootPath;
        // One record per stream, so interleaved parent and sub-agent frames cannot clear each other.
        this.streamStates = new Map();
        this.subAgentLabels = new Map();
        // Tool calls outlive the message that issued them: their result can arrive after the next
        // `message_start`, and for a sub agent it arrives on a different stream entirely.
        this.toolBlocks = new Map();
        this.streamedTextItems = new Map();
        this.protocolErrorSequence = 1;
        this.contextUsageRequestSequence = 1;
        this.pendingContextUsage = null;
        this.fileResultDecoder = new ClaudeFileResultDecoder(rootPath);
        this.messageUsages = new Map();
        this.turnStarted = false;
    }

    streamState(streamKey) {
        const current = this.streamStates.get(streamKey);
        if (current) return current;
        const created = createStreamState();
        this.streamStates.set(streamKey, created);

        return created;
    }

    subAgentLabel(streamKey) {
        return this.subAgentLabels.get(streamKey) ?? DEFAULT_SUB_AGENT_LABEL;
    }

    rememberSubAgent(block) {
        if (block?.name !== CLAUDE_SUB_AGENT_TOOL || typeof block.id !== 'string') return;
        const label = claudeSubAgentLabel(block.input);
        if (label) this.subAgentLabels.set(block.id, label);
    }

    async start(prompt) {
        await this.sendMessage(prompt);
    }

    async sendMessage(content) {
        await this.writeLine(claudeUserMessage(requireMessage(content)));
    }

    async answerQuestion(requestId, answers) {
        const pendingQuestion = this.pendingQuestions.get(requestId);
        if (!pendingQuestion) throw new Error(`Unknown or stale Claude question request id: ${requestId}`);
        if (pendingQuestion.submitted) throw new Error(`Claude question request was already submitted: ${requestId}`);
        const mappedAnswers = Object.fromEntries(pendingQuestion.questions.map(({ id, question }) => {
            if (!Object.hasOwn(answers, id)) throw new Error(`Missing answer for Claude question: ${id}`);

            return [question, answers[id]];
        }));
        const updatedInput = { ...pendingQuestion.input, answers: mappedAnswers };
        const response = { behavior: 'allow', toolUseID: pendingQuestion.toolUseId, updatedInput };
        pendingQuestion.submitted = true;
        try {
            await this.writeLine(claudeControlResponse(requestId, response));
        } catch (error) {
            pendingQuestion.submitted = false;
            throw error;
        }
        this.pendingQuestions.delete(requestId);
    }

    async dismissQuestion(requestId) {
        const pendingQuestion = this.pendingQuestions.get(requestId);
        if (!pendingQuestion) throw new Error(`Unknown or stale Claude question request id: ${requestId}`);
        if (pendingQuestion.submitted) throw new Error(`Claude question request was already submitted: ${requestId}`);
        const response = {
            behavior: 'deny',
            message: 'User dismissed questions',
            toolUseID: pendingQuestion.toolUseId,
        };
        pendingQuestion.submitted = true;
        try {
            await this.writeLine(claudeControlResponse(requestId, response));
        } catch (error) {
            pendingQuestion.submitted = false;
            throw error;
        }
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
        if (event.type === 'control_response') {
            await this.handleContextUsageResponse(event);
            return;
        }
        const questionRequest = claudeQuestionRequest(event);
        if (questionRequest) {
            if (this.pendingQuestions.has(questionRequest.requestId)) {
                throw new Error(`Duplicate Claude question request id: ${questionRequest.requestId}`);
            }
            this.pendingQuestions.set(questionRequest.requestId, { ...questionRequest, submitted: false });
            await this.onEvent({
                questions: questionRequest.questions,
                requestId: questionRequest.requestId,
                type: 'question',
            });
            return;
        }
        const approvalRequest = claudeApprovalRequest(event, this.subAgentLabels);
        if (approvalRequest?.error) {
            await this.emitProtocolError(approvalRequest.error, approvalRequest.streamKey);
            return;
        }
        if (approvalRequest) {
            const { requestId } = approvalRequest.approval;
            if (this.pendingApprovals.has(requestId)) {
                await this.emitProtocolError(
                    `duplicate Claude approval request id: ${requestId}`,
                    approvalRequest.approval.parentItemId,
                );
                return;
            }
            this.pendingApprovals.set(requestId, { ...approvalRequest, submitted: false });
            await this.onEvent({ approval: approvalRequest.approval, type: 'approval' });
            return;
        }
        if (event.type === 'control_request' && event.request?.subtype === 'can_use_tool') {
            await this.emitProtocolError('invalid Claude question request');
            return;
        }
        if (event.type === 'system' && typeof event.session_id === 'string') {
            await this.onEvent({ conversationId: event.session_id, type: 'sessionStarted' });
        }
        if (event.type === 'system') {
            if (event.subtype !== 'init') ClaudeStreamingAdapter.ignoreProtocolNoise();
            return;
        }
        const streamKey = claudeStreamKey(event);
        if (event.type === 'stream_event') {
            await this.handleStreamEvent(event.event, streamKey);
            return;
        }
        if (event.type === 'assistant') {
            await this.handleAssistantCompletion(event, streamKey);
            return;
        }
        if (event.type === 'user') {
            await this.ensureTurnStarted();
            await this.handleToolResults(event);
            return;
        }
        if (event.type === 'result') {
            // Only the main agent's result ends the turn; a sub agent finishing must not clear the
            // parent's pending approvals, report usage, or request context usage.
            if (streamKey) {
                this.streamStates.delete(streamKey);
                return;
            }
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

    async handleStreamEvent(streamEvent, streamKey = null) {
        if (!streamEvent || typeof streamEvent.type !== 'string') {
            await this.emitProtocolError('invalid stream event', streamKey);
            return;
        }
        if (streamEvent.type === 'message_start') {
            await this.ensureTurnStarted();
            const state = this.streamState(streamKey);
            state.activeMessageId = streamEvent.message?.id;
            state.activeBlocks.clear();
            state.activeTextOrdinal = 0;
            if (typeof state.activeMessageId !== 'string' || state.activeMessageId.length === 0) {
                await this.emitProtocolError('message_start missing message id', streamKey);
            }
            return;
        }
        if (streamEvent.type === 'content_block_start') {
            await this.handleContentBlockStart(streamEvent, streamKey);
            return;
        }
        if (streamEvent.type === 'content_block_delta') {
            await this.handleContentBlockDelta(streamEvent, streamKey);
            return;
        }
        if (streamEvent.type === 'content_block_stop' || streamEvent.type === 'message_delta' || streamEvent.type === 'message_stop') return;
        ClaudeStreamingAdapter.ignoreProtocolNoise();
    }

    async handleContentBlockStart(streamEvent, streamKey) {
        const state = this.streamState(streamKey);
        const validBlock = !!streamEvent.content_block
            && typeof streamEvent.content_block === 'object'
            && !Array.isArray(streamEvent.content_block);
        const { activeMessageId } = state;
        if (!Number.isSafeInteger(streamEvent.index) || !validBlock || typeof activeMessageId !== 'string' || activeMessageId.length === 0) {
            await this.emitProtocolError('invalid content_block_start', streamKey);
            return;
        }
        const block = structuredClone(streamEvent.content_block);
        const generatedItemId = block.type === 'text'
            ? claudeTextItemId(activeMessageId, state.activeTextOrdinal++)
            : `${activeMessageId}:${block.type}:${streamEvent.index}`;
        const providerItemId = block.type === 'text'
            ? namespacedItemId(streamKey, generatedItemId)
            : block.id ?? namespacedItemId(streamKey, generatedItemId);
        const separator = block.type === 'text' && !streamKey && state.turnHasAssistantText ? '\n\n' : '';
        const trackedBlock = { block, inputJson: '', providerItemId, separator, streamKey, text: block.text ?? block.thinking ?? '' };
        state.activeBlocks.set(streamEvent.index, trackedBlock);
        if (block.type === 'text') {
            if (streamKey) {
                await this.onEvent({ event: this.subAgentTextEvent(streamKey, providerItemId, trackedBlock.text), type: 'event' });
                return;
            }
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
            await this.onEvent({ event: ownedEvent(event, streamKey), type: 'event' });
            return;
        }
        if (block.type === 'tool_use') {
            this.rememberSubAgent(block);
            this.toolBlocks.set(providerItemId, trackedBlock);
            await this.onEvent({ event: ownedEvent(claudeToolEvent(block, 'inProgress', providerItemId), streamKey), type: 'event' });
        }
    }

    subAgentTextEvent(streamKey, providerItemId, content, status = 'inProgress') {
        return {
            ...eventBase(providerItemId, CLAUDE_SUB_AGENT_MESSAGE_TYPE, this.subAgentLabel(streamKey), status),
            content,
            parentItemId: streamKey,
        };
    }

    async handleContentBlockDelta(streamEvent, streamKey) {
        const state = this.streamState(streamKey);
        const trackedBlock = state.activeBlocks.get(streamEvent.index);
        if (!trackedBlock || !streamEvent.delta || typeof streamEvent.delta.type !== 'string') {
            await this.emitProtocolError('invalid content_block_delta', streamKey);
            return;
        }
        const { delta } = streamEvent;
        if (delta.type === 'text_delta' && typeof delta.text === 'string' && trackedBlock.block.type === 'text') {
            trackedBlock.text += delta.text;
            state.turnHasAssistantText = state.turnHasAssistantText || delta.text.length > 0;
            if (streamKey) {
                await this.onEvent({
                    event: this.subAgentTextEvent(streamKey, trackedBlock.providerItemId, trackedBlock.text),
                    type: 'event',
                });
                return;
            }
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
            await this.onEvent({ event: ownedEvent(event, streamKey), type: 'event' });
            return;
        }
        if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string' && trackedBlock.block.type === 'tool_use') {
            trackedBlock.inputJson += delta.partial_json;
            const updatedBlock = { ...trackedBlock.block, input: trackedBlock.inputJson };
            await this.onEvent({
                event: ownedEvent(claudeToolEvent(updatedBlock, 'inProgress', trackedBlock.providerItemId), streamKey),
                type: 'event',
            });
            return;
        }
        if (delta.type !== 'signature_delta') ClaudeStreamingAdapter.ignoreProtocolNoise();
    }

    async handleAssistantCompletion(event, streamKey = null) {
        await this.ensureTurnStarted();
        recordClaudeAssistantUsage(this.messageUsages, event);
        if (!Array.isArray(event.message?.content)) {
            await this.emitProtocolError('assistant message missing content', streamKey);
            return;
        }
        const state = this.streamState(streamKey);
        const messageId = event.message.id ?? state.activeMessageId;
        if (typeof messageId !== 'string' || messageId.length === 0) {
            await this.emitProtocolError('missing Claude assistant message id', streamKey);
            return;
        }
        const fileEvents = new Map(this.fileResultDecoder.decode(event).map((fileEvent) => [fileEvent.providerItemId, fileEvent]));
        let textOrdinal = 0;
        for (const [index, block] of event.message.content.entries()) {
            if (block.type === 'text' && typeof block.text === 'string') {
                // Same ordinal scheme as streaming so the aggregated copy reconciles regardless of where
                // thinking/tool blocks sit in the aggregated array.
                const providerItemId = namespacedItemId(streamKey, claudeTextItemId(messageId, textOrdinal));
                textOrdinal += 1;
                if (streamKey) {
                    await this.onEvent({
                        event: this.subAgentTextEvent(streamKey, providerItemId, block.text, 'completed'),
                        type: 'event',
                    });
                    continue;
                }
                const streamedItem = this.streamedTextItems.get(providerItemId);
                const separator = streamedItem?.separator ?? (state.turnHasAssistantText ? '\n\n' : '');
                if (!streamedItem) {
                    await this.onEvent({ itemId: providerItemId, type: 'assistantStarted' });
                    // Record the freshly created item so a repeat aggregated delivery of the same step
                    // (the `AskUserQuestion` pause re-emits it) reconciles in place instead of duplicating.
                    this.streamedTextItems.set(providerItemId, { separator });
                }
                state.turnHasAssistantText = state.turnHasAssistantText || block.text.length > 0;
                await this.onEvent({ content: `${separator}${block.text}`, itemId: providerItemId, type: 'assistantCompleted' });
                continue;
            }
            const providerItemId = block.id ?? namespacedItemId(streamKey, `${messageId}:${block.type}:${index}`);
            if (block.type === 'thinking') {
                const content = typeof block.thinking === 'string' ? block.thinking : '';
                const reasoningEvent = {
                    ...eventBase(providerItemId, 'reasoning', 'Thinking', 'completed'),
                    content,
                    details: [content],
                    summary: [],
                };
                await this.onEvent({ event: ownedEvent(reasoningEvent, streamKey), type: 'event' });
                continue;
            }
            if (block.type === 'tool_use') {
                this.rememberSubAgent(block);
                this.toolBlocks.set(providerItemId, { block, providerItemId, streamKey });
                const toolEvent = fileEvents.get(providerItemId) ?? claudeToolEvent(block, 'inProgress', providerItemId);
                await this.onEvent({ event: ownedEvent(toolEvent, streamKey), type: 'event' });
            }
        }
    }

    async handleToolResults(event) {
        if (!Array.isArray(event.message?.content)) return;
        const fileEvents = new Map(this.fileResultDecoder.decode(event).map((fileEvent) => [fileEvent.providerItemId, fileEvent]));
        for (const block of event.message.content) {
            if (block?.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue;
            // Looked up across every stream and every message of the turn, so a result still completes
            // its own row after the next message started or after a sub agent interleaved its frames.
            const trackedTool = this.toolBlocks.get(block.tool_use_id);
            const toolEvent = fileEvents.get(block.tool_use_id) ?? (trackedTool?.block?.type === 'tool_use'
                ? claudeToolEvent(trackedTool.block, block.is_error ? 'failed' : 'completed')
                : eventBase(block.tool_use_id, 'tool.result', 'Tool result', block.is_error ? 'failed' : 'completed'));
            const result = boundedAgentResult(normalizedContent(block.content) ?? '');
            if (toolEvent.type === 'commandExecution') toolEvent.content = result;
            else if (!Object.hasOwn(toolEvent, 'output')) toolEvent.output = result;
            await this.onEvent({ event: ownedEvent(toolEvent, trackedTool?.streamKey ?? null), type: 'event' });
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
        this.streamStates.clear();
        this.subAgentLabels.clear();
        this.toolBlocks.clear();
        this.fileResultDecoder.reset();
        this.streamedTextItems.clear();
        this.pendingQuestions.clear();
        this.turnStarted = false;
        const usage = claudeUsage(event, accumulatedClaudeUsage(this.messageUsages));
        this.messageUsages.clear();
        const turnCompletedEvent = { error, missingSession, type: 'turnCompleted', usage };
        if (error) {
            await this.onEvent(turnCompletedEvent);
            return;
        }
        await this.requestContextWindowUsage(turnCompletedEvent);
    }

    async requestContextWindowUsage(turnCompletedEvent) {
        const requestId = `claude-context-usage-${this.contextUsageRequestSequence}`;
        this.contextUsageRequestSequence += 1;
        const timeout = setTimeout(async () => {
            await this.completeContextUsageRequest(requestId, null);
        }, CLAUDE_CONTEXT_USAGE_TIMEOUT_MS);
        this.pendingContextUsage = { requestId, timeout, turnCompletedEvent };
        try {
            await this.writeLine(claudeContextUsageRequest(requestId));
        } catch {
            await this.completeContextUsageRequest(requestId, null);
        }
    }

    async handleContextUsageResponse(event) {
        const requestId = event.response?.request_id;
        if (requestId !== this.pendingContextUsage?.requestId) return;

        await this.completeContextUsageRequest(requestId, claudeContextWindowUsage(event));
    }

    async completeContextUsageRequest(requestId, contextWindowUsage) {
        const pendingContextUsage = this.pendingContextUsage;
        if (!pendingContextUsage || pendingContextUsage.requestId !== requestId) return;
        clearTimeout(pendingContextUsage.timeout);
        this.pendingContextUsage = null;
        await this.onEvent({ ...pendingContextUsage.turnCompletedEvent, contextWindowUsage });
    }

    static ignoreProtocolNoise() {
        // Valid protocol additions need no user-facing event until adapter support exists.
    }

    async emitProtocolError(content, streamKey = null) {
        const messageId = this.streamStates.get(streamKey)?.activeMessageId ?? 'unknown-message';
        const providerItemId = namespacedItemId(streamKey, `error:${messageId}:${this.protocolErrorSequence}`);
        this.protocolErrorSequence += 1;
        const event = { ...eventBase(providerItemId, 'error', 'Claude protocol error', 'failed'), content };
        await this.onEvent({ event: ownedEvent(event, streamKey), type: 'event' });
    }
}

module.exports = { ClaudeStreamingAdapter };
