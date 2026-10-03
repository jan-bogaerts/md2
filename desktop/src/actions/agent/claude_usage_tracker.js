const { sumAgentTokenUsage, validateAgentTokenUsage } = require('../../../../shared/agent_usage_math.mjs');
const { claudeUsage } = require('./agent_claude_events');

const EMPTY_USAGE = { cachedInputTokens: 0, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 };

/** Convert cumulative whole-tree Claude results into newly accounted turn increments. */
class ClaudeUsageTracker {
    constructor(conversationId = null, usageBaseline = null) {
        this.conversationId = conversationId;
        this.usageBaseline = usageBaseline ?? (conversationId ? {} : { costUsd: 0, tokens: EMPTY_USAGE });
        this.lastResultId = this.usageBaseline.resultId ?? null;
    }

    observe(event) {
        if (event.parent_tool_use_id) return;
        if (event.type === 'conversation_reset') {
            if (typeof event.new_conversation_id !== 'string' || event.new_conversation_id.length === 0) {
                throw new Error('Missing Claude reset conversation id');
            }
            this.reset(event.new_conversation_id);
            return;
        }
        if (event.type === 'system' && event.subtype === 'init' && typeof event.session_id === 'string') {
            this.useConversation(event.session_id);
        }
    }

    useConversation(conversationId) {
        if (this.conversationId && this.conversationId !== conversationId) this.reset(conversationId);
        this.conversationId = conversationId;
    }

    reset(conversationId) {
        this.conversationId = conversationId;
        this.usageBaseline = { costUsd: 0, tokens: EMPTY_USAGE };
        this.lastResultId = null;
    }

    isDuplicateResult(event) {
        return event.type === 'result' && !event.parent_tool_use_id && typeof event.uuid === 'string' && event.uuid === this.lastResultId;
    }

    read(event, fallbackUsage = null) {
        if (event.type !== 'result' || event.parent_tool_use_id) return null;
        if (typeof event.session_id === 'string') this.useConversation(event.session_id);
        if (this.isDuplicateResult(event)) return null;
        const reportedUsage = claudeUsage(event, fallbackUsage);
        if (!reportedUsage) return null;
        const { costUsd, ...tokens } = reportedUsage;
        // A crash can erase the provider's counters. It does not reset the accounting session.
        if (event.is_error && event.subtype === 'error_during_execution' && tokens.totalTokens === 0 && costUsd === 0) return null;
        const hasModelUsage = event.modelUsage !== undefined;
        const baseline = this.usageBaseline;
        const turnTokens = hasModelUsage
            ? this.modelUsageIncrement(tokens, event, fallbackUsage)
            : tokens;
        const turnCost = costUsd !== undefined && baseline.costUsd !== undefined ? costUsd - baseline.costUsd : undefined;
        const turnUsage = turnTokens ? { ...turnTokens, ...(turnCost !== undefined ? { costUsd: turnCost } : {}) } : null;
        const usage = turnUsage ? validateAgentTokenUsage(turnUsage) : null;
        const cumulativeTokens = hasModelUsage ? tokens : baseline.tokens ? sumAgentTokenUsage([baseline.tokens, tokens]) : undefined;
        this.usageBaseline = {
            ...(costUsd !== undefined || baseline.costUsd !== undefined ? { costUsd: costUsd ?? baseline.costUsd } : {}),
            ...(typeof event.uuid === 'string' ? { resultId: event.uuid } : {}),
            ...(cumulativeTokens ? { tokens: cumulativeTokens } : {}),
        };
        this.lastResultId = this.usageBaseline.resultId ?? null;

        return usage;
    }

    modelUsageIncrement(tokens, event, fallbackUsage) {
        const baseline = this.usageBaseline.tokens;
        if (!baseline) {
            // Existing resumed sessions have no raw baseline. Keep their per-turn main-loop usage,
            // then baseline the whole-tree snapshot; previously displayed totals are not trustworthy.
            const turnResult = { ...event, modelUsage: undefined, total_cost_usd: undefined };

            return claudeUsage(turnResult, fallbackUsage);
        }

        const turnUsage = {
            cachedInputTokens: tokens.cachedInputTokens - baseline.cachedInputTokens,
            inputTokens: tokens.inputTokens - baseline.inputTokens,
            outputTokens: tokens.outputTokens - baseline.outputTokens,
            reasoningTokens: tokens.reasoningTokens - baseline.reasoningTokens,
        };

        return validateAgentTokenUsage(turnUsage);
    }
}

module.exports = { ClaudeUsageTracker };
