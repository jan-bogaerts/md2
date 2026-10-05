const { extractAgentCommitIds, extractCommitSummaries } = require('../../../../shared/action_history.mjs');
const { requireRootPath } = require('../../git/git_commands');

function combineOutput(result) {
    return `${result.stdout}${result.stderr}`;
}

function createCommandDetails(input) {
    return {
        command: input.result.command,
        output: combineOutput(input.result),
        type: 'command',
    };
}

function createAgentDetails(input) {
    const acknowledgedSettings = input.result.acknowledgedSettings;
    return {
        ...(input.result.agent !== undefined ? { agent: input.result.agent } : {}),
        ...(input.result.model !== undefined ? { model: input.result.model } : {}),
        ...(input.result.permissionMode !== undefined ? { permissionMode: input.result.permissionMode } : {}),
        ...(input.result.thinkingLevel !== undefined ? { thinkingLevel: input.result.thinkingLevel } : {}),
        ...(input.result.speedMode !== undefined ? { speedMode: input.result.speedMode } : {}),
        ...(acknowledgedSettings?.model !== undefined ? { acknowledgedModel: acknowledgedSettings.model } : {}),
        ...(acknowledgedSettings?.serviceTier !== undefined ? { acknowledgedServiceTier: acknowledgedSettings.serviceTier } : {}),
        type: 'agent',
    };
}

function commitCandidates(input) {
    if (input.action.type === 'agent') {
        const trackedCandidates = input.action.trackFileChanges
            && typeof input.result.trackedCommit === 'string'
            && input.result.trackedCommit.length > 0
            ? [{ branch: input.project.branch, commit: input.result.trackedCommit }]
            : [];
        const reportedCandidates = extractAgentCommitIds(input.result.stdout)
            .map((commit) => ({ branch: input.project.branch, commit }));

        return [...trackedCandidates, ...reportedCandidates];
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

module.exports = {
    captureCommitReferences,
    combineOutput,
    createAgentDetails,
    createCommandDetails,
};
