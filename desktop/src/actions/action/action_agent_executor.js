const { resolveAgentExecution } = require('../agent/agent_execution');
const { buildResumeAgentCommand, buildAgentStreamingCommand, resolveAgentConfiguration } = require('../agent/agent_profiles.mjs');
const { normalizeConversationContext } = require('../agent/agent_transcript');
const { appendCurrentCardReferences } = require('./action_card_references');
const { resolveAgentPrompt, resolvePopupPrompt } = require('./action_text');

const CONTINUE_INPUT = 'continue';
function continuationReferencePath(reference) {
    return reference;
}

function withoutProviderConversationId(request) {
    return Object.fromEntries(Object.entries(request).filter(([fieldName]) => fieldName !== 'providerConversationId'));
}

function withoutConversation(result) {
    return Object.fromEntries(Object.entries(result).filter(([fieldName]) => fieldName !== 'conversation'));
}

function executionCommand(resolvedAgent, providerSession, streaming) {
    if (!providerSession) return resolvedAgent.command;
    if (!streaming || resolvedAgent.agent === 'claude') {
        return buildResumeAgentCommand(resolvedAgent.profile, providerSession.conversationId, resolvedAgent.command);
    }

    return resolvedAgent.command;
}

class ActionAgentExecutor {
    constructor(dependencies) {
        this.agentConfigProvider = dependencies.agentConfigProvider;
        this.agentRunnerService = dependencies.agentRunnerService;
        this.localGitService = dependencies.localGitService;
    }

    async execute(input) {
        if (input.compactOnly) return this.executeCompact(input);
        const config = this.agentConfigProvider();
        const permissionMode = input.runInput.permissionMode ?? input.action.permissionMode;
        const thinkingLevel = input.runInput.thinkingLevel ?? input.action.thinkingLevel;
        const speedMode = input.runInput.speedMode ?? input.action.speedMode;
        const streaming = input.action.streaming;
        const resolvedAgent = resolveAgentExecution(config, {
            ...(input.runInput.agent ? { agent: input.runInput.agent } : (input.action.agent ? { agent: input.action.agent } : {})),
            ...(input.runInput.model ? { model: input.runInput.model } : (input.action.model ? { model: input.action.model } : {})),
            ...(permissionMode ? { permissionMode } : {}),
            ...(thinkingLevel ? { thinkingLevel } : {}),
            ...(speedMode !== undefined && speedMode !== null ? { speedMode } : {}),
        }, streaming);
        const sourceConversation = input.runInput.continueFrom
            ? await this.localGitService.loadAgentConversation(
                input.primaryProject,
                continuationReferencePath(input.runInput.continueFrom),
            )
            : null;
        if (sourceConversation && input.runInput.conversationId && sourceConversation.id !== input.runInput.conversationId) {
            throw new Error('Continuation conversation ID does not match the loaded conversation');
        }
        const expectedCardInternalId = input.activityOrigin.kind === 'card' ? input.activityOrigin.cardInternalId : null;
        if (sourceConversation && sourceConversation.cardInternalId !== expectedCardInternalId) {
            throw new Error(`Agent conversation belongs to ${sourceConversation.cardInternalId}, not ${expectedCardInternalId}`);
        }

        const providerSession = sourceConversation?.providerSessions
            ?.find(({ agent }) => agent === resolvedAgent.agent) ?? null;
        const hasPromptOverride = Object.hasOwn(input.runInput, 'prompt');
        const basePrompt = hasPromptOverride
            ? input.action.output?.kind === 'diagram' && !input.runInput.diagramPath
                ? resolveAgentPrompt(
                    { output: input.action.output, prompt: input.runInput.prompt },
                    input.context,
                    input.project,
                    input.primaryProject,
                    input.projectFolder,
                    input.releasesFolder,
                    input.activeCardsFolder,
                    '',
                    input.diagramFooter,
                    input.diagramFile,
                    input.version,
                )
                : resolvePopupPrompt(
                    input.runInput.prompt,
                    input.context,
                    input.project,
                    input.primaryProject,
                    input.projectFolder,
                    input.releasesFolder,
                    input.activeCardsFolder,
                    input.diagramFile,
                    input.version,
                )
            : sourceConversation
                ? input.runInput.extraPrompt.trim().length > 0 ? input.runInput.extraPrompt : CONTINUE_INPUT
                : resolveAgentPrompt(
                    input.action,
                    input.context,
                    input.project,
                    input.primaryProject,
                    input.projectFolder,
                    input.releasesFolder,
                    input.activeCardsFolder,
                    input.runInput.extraPrompt,
                    input.diagramFooter,
                    input.diagramFile,
                    input.version,
                );
        const prompt = await appendCurrentCardReferences(
            basePrompt,
            input.context,
            input.primaryProject,
            this.localGitService,
        );
        const command = executionCommand(resolvedAgent, providerSession, streaming);
        const contextInput = sourceConversation
            ? normalizeConversationContext(sourceConversation, providerSession?.synchronizedThroughMessageId ?? null)
            : '';
        const reference = input.runInput.continueFrom
            ? continuationReferencePath(input.runInput.continueFrom)
            : input.conversationReservation?.reference;
        const request = {
            actionId: input.action.id,
            agent: resolvedAgent.agent,
            activityOrigin: input.activityOrigin,
            activityProject: input.primaryProject,
            ...(input.context.file ? { cardPath: input.context.file } : {}),
            command,
            executionSettings: resolvedAgent.executionSettings,
            ...(sourceConversation ? { conversation: sourceConversation, reference } : {}),
            ...(!sourceConversation ? {
                conversationId: input.conversationReservation?.conversationId ?? input.runInput.conversationId,
                reference,
            } : {}),
            ...(contextInput ? { contextInput } : {}),
            actionRunId: input.runId,
            ...(input.runInput.submissionId ? { submissionId: input.runInput.submissionId } : {}),
            prompt,
            projectFolder: input.projectFolder,
            releasesFolder: input.releasesFolder,
            streaming,
            ...(providerSession ? { providerConversationId: providerSession.conversationId } : {}),
            title: input.action.label,
        };
        const fallback = {
            command: resolvedAgent.command,
            contextInput: sourceConversation ? normalizeConversationContext(sourceConversation) : '',
        };
        const result = await this.runAgentTurn(input, request, fallback);
        const executionResult = withoutConversation(result);

        return {
            ...executionResult,
            agent: resolvedAgent.agent,
            model: resolvedAgent.model,
            permissionMode: resolvedAgent.permissionMode,
            thinkingLevel: resolvedAgent.thinkingLevel,
            ...(resolvedAgent.speedMode !== undefined ? { speedMode: resolvedAgent.speedMode } : {}),
        };
    }

    /** Resume only the captured provider session; never synthesize continuation input. */
    async executeCompact(input) {
        const conversation = await this.localGitService.loadAgentConversation(input.primaryProject, input.runInput.continueFrom);
        const expectedCardInternalId = input.activityOrigin.kind === 'card' ? input.activityOrigin.cardInternalId : null;
        if (conversation.id !== input.runInput.conversationId || (conversation.cardInternalId ?? null) !== expectedCardInternalId
            || conversation.actionId !== input.action.id) throw new Error('Compact conversation identity or ownership changed');
        const providerSession = conversation.providerSessions.find(({ agent }) => agent === input.runInput.agent);
        if (!providerSession?.conversationId) throw new Error('Missing provider session for compact');
        const resolvedAgent = resolveAgentConfiguration(this.agentConfigProvider(), { agent: providerSession.agent });
        const command = buildAgentStreamingCommand(
            resolvedAgent.profile, resolvedAgent.model, resolvedAgent.thinkingLevel, resolvedAgent.permissionMode,
        );
        const request = {
            actionId: input.action.id, actionRunId: input.runId, activityOrigin: input.activityOrigin,
            activityProject: input.primaryProject, agent: resolvedAgent.agent,
            command: executionCommand({ ...resolvedAgent, command }, providerSession, true), compactOnly: true, conversation,
            projectFolder: input.projectFolder, providerConversationId: providerSession.conversationId,
            reference: input.runInput.continueFrom, releasesFolder: input.releasesFolder, streaming: true, title: conversation.title,
        };
        return this.runAgentProcess(input, request);
    }

    async runAgentTurn(input, request, fallback) {
        const result = await this.runAgentProcess(input, request);
        if (!request.providerConversationId || !result.missingSession || result.turnStarted) return result;

        const fallbackRequest = {
            ...withoutProviderConversationId(request),
            command: fallback.command,
            conversation: result.conversation,
            ...(fallback.contextInput ? { contextInput: fallback.contextInput } : {}),
            reference: result.reference,
            reuseLastUserMessage: true,
        };

        return this.runAgentProcess(input, fallbackRequest);
    }

    async runAgentProcess(input, request) {
        const { promise, reject, resolve } = Promise.withResolvers();
        const onComplete = (exitCode, run) => resolve({
            command: request.command,
            changedPaths: run.changedPaths ? [...run.changedPaths] : [],
            conversation: run.conversation,
            conversationId: run.conversation.id,
            exitCode,
            missingSession: run.missingSession,
            prompt: request.prompt,
            reference: run.reference,
            stderr: run.stderr,
            stdout: run.stdout,
            turnStarted: run.turnStarted,
            ...(run.streamingAdapter?.resolvedSettings ? { acknowledgedSettings: run.streamingAdapter.resolvedSettings } : {}),
        });
        const onEvent = (agentEvent) => input.onEvent(agentEvent);
        const started = await this.agentRunnerService.start(
            input.project, request, onEvent, onComplete, reject, input.onConversationSaved,
        );
        input.onActiveRunChange(started.runId);

        try {
            if (input.signal.aborted) this.agentRunnerService.stop(started.runId);

            return await promise;
        } finally {
            input.onActiveRunChange(null);
        }
    }
}

module.exports = { ActionAgentExecutor, continuationReferencePath };
