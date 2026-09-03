const path = require('node:path');
const { requireRootPath } = require('../../git/git_commands');

const PLACEHOLDER_NAMES = [
    'active-cards-folder', 'worktree-folder', 'repository-folder', 'project-folder',
    'releases-folder', 'card-file', 'this-card', 'card-title', 'card-prompt',
    'conflict-file', 'conflict-files', 'diagram-file', 'parent-node',
].join('|');
const PLACEHOLDER_PATTERN = new RegExp(`\\{\\{\\s*(${PLACEHOLDER_NAMES})\\s*\\}\\}`, 'gu');
const CARD_PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*card-prompt\s*\}\}/u;

function resolvePlaceholders(
    text,
    context,
    runProject,
    primaryProject,
    projectFolder,
    releasesFolder,
    activeCardsFolder,
    extraPrompt,
    diagramFile,
) {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name) => {
        if (name === 'active-cards-folder') {
            if (typeof activeCardsFolder !== 'string' || activeCardsFolder.length === 0) {
                throw new Error('Cannot resolve active-cards-folder placeholder without a configured working folder');
            }

            return path.resolve(requireRootPath(primaryProject), activeCardsFolder);
        }
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
        if (name === 'diagram-file') {
            if (context.kind !== 'diagram') throw new Error('Cannot resolve diagram-file placeholder outside diagram context');
            if (typeof diagramFile !== 'string' || diagramFile.length === 0) {
                throw new Error('Cannot resolve diagram-file placeholder without a diagram output path');
            }

            return diagramFile;
        }
        if (name === 'parent-node') {
            if (context.kind !== 'diagram' || context.type !== 'child') {
                throw new Error('Cannot resolve parent-node placeholder outside child diagram context');
            }
            if (!context.parentNode) {
                throw new Error('Cannot resolve parent-node placeholder without a selected diagram item label');
            }

            return context.parentNode;
        }
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

function composeAgentPrompt(prompt, output, diagramFooter) {
    if (output?.kind !== 'diagram') return prompt;
    if (typeof diagramFooter !== 'string' || diagramFooter.length === 0) throw new Error('Missing diagram footer');

    return `${prompt}\n\n${diagramFooter}`;
}

function resolveAgentPrompt(
    action,
    context,
    runProject,
    primaryProject,
    projectFolder,
    releasesFolder,
    activeCardsFolder,
    extraPrompt,
    diagramFooter,
    diagramFile,
) {
    const composedPrompt = composeAgentPrompt(action.prompt, action.output, diagramFooter);
    const prompt = resolvePlaceholders(
        composedPrompt,
        context,
        runProject,
        primaryProject,
        projectFolder,
        releasesFolder,
        activeCardsFolder,
        extraPrompt,
        diagramFile,
    );
    if (CARD_PROMPT_PLACEHOLDER_PATTERN.test(action.prompt) || extraPrompt.trim().length === 0) return prompt;

    return `${prompt}\n\n${extraPrompt}`;
}

/** Resolves recognized placeholders entered in the editable agent popup prompt. */
function resolvePopupPrompt(text, context, runProject, primaryProject, projectFolder, releasesFolder, activeCardsFolder, diagramFile) {
    return resolvePlaceholders(
        text,
        context,
        runProject,
        primaryProject,
        projectFolder,
        releasesFolder,
        activeCardsFolder,
        '',
        diagramFile,
    );
}

module.exports = { composeAgentPrompt, resolveAgentPrompt, resolvePlaceholders, resolvePopupPrompt };
