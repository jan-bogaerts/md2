const path = require('node:path');
const { requireRootPath } = require('../../git/git_commands');

const PLACEHOLDER_PATTERN = /\{\{\s*(worktree-folder|project-folder|releases-folder|card-file|card-title|card-prompt)\s*\}\}/gu;
const CARD_PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*card-prompt\s*\}\}/u;
const TRACKED_FILE_COMMIT_INSTRUCTION = 'Do not stage or commit changes. md2 will commit files captured from provider edit tools.';

function resolvePlaceholders(text, context, executionProject, primaryProject, releasesFolder, extraPrompt) {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name) => {
        if (name === 'worktree-folder') return requireRootPath(executionProject);
        if (name === 'project-folder') return requireRootPath(primaryProject);
        if (name === 'releases-folder') {
            if (typeof releasesFolder !== 'string' || releasesFolder.length === 0) {
                throw new Error('Cannot resolve releases-folder placeholder without a configured releases folder');
            }

            return path.resolve(requireRootPath(primaryProject), releasesFolder);
        }
        if (name === 'card-prompt') return extraPrompt;
        if (name === 'card-title') {
            if (!context.title) throw new Error('Cannot resolve card-title placeholder without a card title');

            return context.title;
        }
        if (!context.file) throw new Error('Cannot resolve card-file placeholder without a file context');

        return context.file;
    });
}

function resolveAgentPrompt(action, context, executionProject, primaryProject, releasesFolder, extraPrompt) {
    const prompt = resolvePlaceholders(action.prompt, context, executionProject, primaryProject, releasesFolder, extraPrompt);
    if (CARD_PROMPT_PLACEHOLDER_PATTERN.test(action.prompt) || extraPrompt.trim().length === 0) return prompt;

    return `${prompt}\n\n${extraPrompt}`;
}

function withTrackedFileCommitInstruction(prompt, trackFileChanges) {
    return trackFileChanges ? `${prompt}\n\n${TRACKED_FILE_COMMIT_INSTRUCTION}` : prompt;
}

function prepareAgentPrompt(action, context, executionProject, primaryProject, releasesFolder, extraPrompt = '') {
    const prompt = resolveAgentPrompt(action, context, executionProject, primaryProject, releasesFolder, extraPrompt);

    return withTrackedFileCommitInstruction(prompt, action.trackFileChanges);
}

module.exports = { prepareAgentPrompt, resolveAgentPrompt, resolvePlaceholders, withTrackedFileCommitInstruction };
