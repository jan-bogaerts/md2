const { extractCommitSummaries } = require('../../../shared/action_history.mjs');
const { requireRootPath } = require('../git/git_commands');

function combineOutput(result) {
    return `${result.stdout}${result.stderr}`;
}

function createCommandHistoryEntry(input) {
    const completedAt = input.completedAt ?? new Date().toISOString();

    return {
        command: input.result.command,
        completedAt,
        output: combineOutput(input.result),
        prompt: '',
        status: input.result.exitCode === 0 ? 'completed' : 'failed',
    };
}

function createAgentHistoryEntry(input) {
    const completedAt = input.completedAt ?? new Date().toISOString();

    return {
        agent: input.result.agent,
        completedAt,
        model: input.result.model,
        output: combineOutput(input.result),
        prompt: input.result.prompt,
        status: input.result.exitCode === 0 ? 'completed' : 'failed',
        thinkingLevel: input.result.thinkingLevel,
    };
}

function commitCandidates(input) {
    if (input.action.type === 'agent') {
        return input.action.trackFileChanges
            && typeof input.result.trackedCommit === 'string'
            && input.result.trackedCommit.length > 0
            ? [{ branch: input.project.branch, commit: input.result.trackedCommit }]
            : [];
    }

    return extractCommitSummaries(combineOutput(input.result));
}

async function captureCommitReferences(localGitService, input) {
    const repositoryRoot = requireRootPath(input.project);
    const references = [];

    for (const candidate of commitCandidates(input)) {
        const metadata = await localGitService.resolveCommitMetadata(repositoryRoot, candidate.commit);
        references.push({
            actionId: input.action.id,
            actionName: input.action.label,
            branch: candidate.branch,
            commit: metadata.commit,
            committedAt: metadata.committedAt,
            deletions: metadata.deletions,
            filePaths: metadata.filePaths,
            filesChanged: metadata.filesChanged,
            insertions: metadata.insertions,
            repositoryRoot,
        });
    }

    return references;
}

function appendHistory(localGitService, input, entry) {
    const request = { actionId: input.action.id, context: input.context, projectFolder: input.projectFolder };

    return localGitService.appendActionRunHistory(input.project, request, entry);
}

module.exports = {
    appendHistory,
    captureCommitReferences,
    combineOutput,
    createAgentHistoryEntry,
    createCommandHistoryEntry,
};
