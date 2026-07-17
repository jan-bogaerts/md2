const { requireRootPath } = require('../git/git_commands');

const PLACEHOLDER_PATTERN = /\{\{\s*(rootProjectFolder|card-file|card-title|card-prompt)\s*\}\}/gu;
const CARD_PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*card-prompt\s*\}\}/u;
const TRACKED_FILE_COMMIT_INSTRUCTION = 'Do not stage or commit changes. md2 will commit files captured from provider edit tools.';

function resolvePlaceholders(text, context, project, extraPrompt) {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name) => {
        if (name === 'rootProjectFolder') return requireRootPath(project);
        if (name === 'card-prompt') return extraPrompt;
        if (name === 'card-title') {
            if (!context.title) throw new Error('Cannot resolve card-title placeholder without a card title');

            return context.title;
        }
        if (!context.file) throw new Error('Cannot resolve card-file placeholder without a file context');

        return context.file;
    });
}

function resolveAgentPrompt(action, context, project, extraPrompt) {
    const prompt = resolvePlaceholders(action.prompt, context, project, extraPrompt);
    if (CARD_PROMPT_PLACEHOLDER_PATTERN.test(action.prompt) || extraPrompt.trim().length === 0) return prompt;

    return `${prompt}\n\n${extraPrompt}`;
}

function withTrackedFileCommitInstruction(prompt, trackFileChanges) {
    return trackFileChanges ? `${prompt}\n\n${TRACKED_FILE_COMMIT_INSTRUCTION}` : prompt;
}

function prepareAgentPrompt(action, context, project, extraPrompt = '') {
    const prompt = resolveAgentPrompt(action, context, project, extraPrompt);

    return withTrackedFileCommitInstruction(prompt, action.trackFileChanges);
}

module.exports = { prepareAgentPrompt, resolveAgentPrompt, resolvePlaceholders, withTrackedFileCommitInstruction };
