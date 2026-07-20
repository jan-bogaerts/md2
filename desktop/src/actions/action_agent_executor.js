const { buildResumeAgentCommand, resolveAgentCommand } = require('./agent_profiles.mjs');
const { normalizeConversationContext } = require('./agent_transcript');
const { prepareAgentPrompt, withTrackedFileCommitInstruction } = require('./action_text');

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

class ActionAgentExecutor {
    constructor(dependencies) {
        this.agentConfigProvider = dependencies.agentConfigProvider;
        this.agentRunnerService = dependencies.agentRunnerService;
        this.localGitService = dependencies.localGitService;
    }

    async execute(input) {
        const config = this.agentConfigProvider();
        const thinkingLevel = input.runInput.thinkingLevel ?? input.action.thinkingLevel;
        const resolvedAgent = resolveAgentCommand(config, {
            ...(input.runInput.agent ? { agent: input.runInput.agent } : (input.action.agent ? { agent: input.action.agent } : {})),
            ...(input.runInput.model ? { model: input.runInput.model } : (input.action.model ? { model: input.action.model } : {})),
            ...(thinkingLevel ? { thinkingLevel } : {}),
        });
        const sourceConversation = input.runInput.continueFrom
            ? await this.localGitService.loadAgentConversation(
                input.primaryProject,
                continuationReferencePath(input.runInput.continueFrom),
            )
            : null;
        if (sourceConversation && sourceConversation.cardPath !== (input.context.file ?? null)) {
            throw new Error(`Agent log belongs to ${sourceConversation.cardPath}, not ${input.context.file}`);
        }

        const providerSession = sourceConversation?.providerSessions
            ?.find(({ agent }) => agent === resolvedAgent.agent) ?? null;
        const hasPromptOverride = Object.hasOwn(input.runInput, 'prompt');
        const prompt = hasPromptOverride
            ? input.runInput.prompt
            : sourceConversation
                ? withTrackedFileCommitInstruction(
                    input.runInput.extraPrompt.trim().length > 0 ? input.runInput.extraPrompt : CONTINUE_INPUT,
                    input.action.trackFileChanges,
                )
                : prepareAgentPrompt(input.action, input.context, input.project, input.runInput.extraPrompt);
        const command = providerSession
            ? buildResumeAgentCommand(resolvedAgent.profile, providerSession.conversationId, resolvedAgent.command)
            : resolvedAgent.command;
        const contextInput = sourceConversation
            ? normalizeConversationContext(sourceConversation, providerSession?.synchronizedThroughMessageId ?? null)
            : '';
        const reference = input.runInput.continueFrom
            ? continuationReferencePath(input.runInput.continueFrom)
            : undefined;
        const request = {
            actionId: input.action.id,
            agent: resolvedAgent.agent,
            activityOrigin: input.activityOrigin,
            activityProject: input.primaryProject,
            ...(input.context.file ? { cardPath: input.context.file } : {}),
            command,
            deferActivityCommit: true,
            ...(sourceConversation ? { conversation: sourceConversation, reference } : {}),
            ...(contextInput ? { contextInput } : {}),
            prompt,
            projectFolder: input.projectFolder,
            ...(providerSession ? { providerConversationId: providerSession.conversationId } : {}),
            title: input.action.label,
        };
        const fallback = {
            command: resolvedAgent.command,
            contextInput: sourceConversation ? normalizeConversationContext(sourceConversation) : '',
        };
        const result = await this.runAgentTurn(input, request, fallback);
        const executionResult = withoutConversation(result);

        return { ...executionResult, agent: resolvedAgent.agent, model: resolvedAgent.model, thinkingLevel: resolvedAgent.thinkingLevel };
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
            conversation: { ...run.conversation, path: run.reference },
            exitCode,
            missingSession: run.missingSession,
            prompt: request.prompt,
            reference: run.reference,
            runId: run.conversation.id,
            stderr: run.stderr,
            stdout: run.stdout,
            turnStarted: run.turnStarted,
        });
        const onEvent = (agentEvent) => input.onEvent(agentEvent);
        const started = await this.agentRunnerService.start(input.project, request, onEvent, onComplete, reject);
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
