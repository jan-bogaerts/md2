const { extractCommitSummary } = require('../../../shared/action_history.mjs');
const { requireRootPath } = require('../git/git_commands');

function combineOutput(result) {
    return `${result.stdout}${result.stderr}`;
}

function createCommitMetadata(input) {
    const summary = extractCommitSummary(input.output);
    if (!summary) return null;

    return {
        actionId: input.actionId,
        branch: summary.branch,
        commit: summary.commit,
        completedAt: input.completedAt,
        filePaths: input.context.file ? [input.context.file] : [],
        repositoryRoot: requireRootPath(input.project),
    };
}

function createCommandHistoryEntry(input) {
    const completedAt = input.completedAt ?? new Date().toISOString();
    const output = combineOutput(input.result);
    const commit = createCommitMetadata({ actionId: input.action.id, completedAt, context: input.context, output, project: input.project });

    return {
        command: input.result.command,
        ...(commit ? { commit } : {}),
        completedAt,
        output,
        prompt: '',
        status: input.result.exitCode === 0 ? 'completed' : 'failed',
    };
}

function createAgentHistoryEntry(input) {
    const completedAt = input.completedAt ?? new Date().toISOString();
    const output = combineOutput(input.result);
    const commit = createCommitMetadata({ actionId: input.action.id, completedAt, context: input.context, output, project: input.project });

    return {
        agent: input.result.agent,
        ...(commit ? { commit } : {}),
        completedAt,
        model: input.result.model,
        output,
        prompt: input.result.prompt,
        status: input.result.exitCode === 0 ? 'completed' : 'failed',
        thinkingLevel: input.result.thinkingLevel,
    };
}

function appendHistory(localGitService, input, entry) {
    const request = { actionId: input.action.id, context: input.context, projectFolder: input.projectFolder };

    return localGitService.appendActionRunHistory(input.project, request, entry);
}

function appendCommandRunHistory(localGitService, input) {
    return appendHistory(localGitService, input, createCommandHistoryEntry(input));
}

function appendAgentRunHistory(localGitService, input) {
    return appendHistory(localGitService, input, createAgentHistoryEntry(input));
}

module.exports = {
    appendAgentRunHistory,
    appendCommandRunHistory,
    combineOutput,
    createAgentHistoryEntry,
    createCommandHistoryEntry,
    createCommitMetadata,
};
