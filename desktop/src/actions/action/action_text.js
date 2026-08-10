const path = require('node:path');
const { requireRootPath } = require('../../git/git_commands');

const FOLDER_PLACEHOLDER_NAMES = 'worktree-folder|repository-folder|project-folder|releases-folder';
const CARD_PLACEHOLDER_NAMES = 'card-file|this-card|card-title|card-prompt';
const CONFLICT_PLACEHOLDER_NAMES = 'conflict-file|conflict-files';
const PLACEHOLDER_PATTERN = new RegExp(`\\{\\{\\s*(${FOLDER_PLACEHOLDER_NAMES}|${CARD_PLACEHOLDER_NAMES}|${CONFLICT_PLACEHOLDER_NAMES})\\s*\\}\\}`, 'gu');
const CARD_PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*card-prompt\s*\}\}/u;

function resolvePlaceholders(text, context, runProject, primaryProject, projectFolder, releasesFolder, extraPrompt) {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name) => {
        if (name === 'worktree-folder') return requireRootPath(runProject);
        if (name === 'repository-folder') return requireRootPath(primaryProject);
        if (name === 'project-folder') {
            if (typeof projectFolder !== 'string') {
                throw new Error('Cannot resolve project-folder placeholder without a configured project folder');
            }

            const repositoryFolder = requireRootPath(primaryProject);

            return projectFolder.length === 0 ? repositoryFolder : path.resolve(repositoryFolder, projectFolder);
        }
        if (name === 'releases-folder') {
            if (typeof releasesFolder !== 'string' || releasesFolder.length === 0) {
                throw new Error('Cannot resolve releases-folder placeholder without a configured releases folder');
            }

            return path.resolve(requireRootPath(primaryProject), releasesFolder);
        }
        if (name === 'card-prompt') return extraPrompt;
        if (name === 'conflict-file') {
            if (!context.conflictFile) throw new Error('Cannot resolve conflict-file placeholder without a selected conflict file');

            return context.conflictFile;
        }
        if (name === 'conflict-files') {
            if (!context.conflictFiles) throw new Error('Cannot resolve conflict-files placeholder without conflict files');

            return context.conflictFiles;
        }
        if (name === 'card-title') {
            if (!context.title) throw new Error('Cannot resolve card-title placeholder without a card title');

            return context.title;
        }
        if (!context.file) throw new Error(`Cannot resolve ${name} placeholder without a file context`);

        return context.file;
    });
}

function resolveAgentPrompt(action, context, runProject, primaryProject, projectFolder, releasesFolder, extraPrompt) {
    const prompt = resolvePlaceholders(action.prompt, context, runProject, primaryProject, projectFolder, releasesFolder, extraPrompt);
    if (CARD_PROMPT_PLACEHOLDER_PATTERN.test(action.prompt) || extraPrompt.trim().length === 0) return prompt;

    return `${prompt}\n\n${extraPrompt}`;
}

module.exports = { resolveAgentPrompt, resolvePlaceholders };
