const { requireRootPath } = require('../git/git_commands');

const PLACEHOLDER_PATTERN = /\{\{\s*(rootProjectFolder|card-file|card-prompt)\s*\}\}/gu;
const CARD_PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*card-prompt\s*\}\}/u;

function resolvePlaceholders(text, context, project, extraPrompt) {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name) => {
        if (name === 'rootProjectFolder') return requireRootPath(project);
        if (name === 'card-prompt') return extraPrompt;
        if (!context.file) throw new Error('Cannot resolve card-file placeholder without a file context');

        return context.file;
    });
}

function resolveAgentPrompt(action, context, project, extraPrompt) {
    const prompt = resolvePlaceholders(action.prompt, context, project, extraPrompt);
    if (CARD_PROMPT_PLACEHOLDER_PATTERN.test(action.prompt) || extraPrompt.trim().length === 0) return prompt;

    return `${prompt}\n\n${extraPrompt}`;
}

module.exports = { resolveAgentPrompt, resolvePlaceholders };
