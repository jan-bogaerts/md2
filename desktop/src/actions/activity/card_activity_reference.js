const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { assertGitRoot, ensureInsideRoot, requireRootPath } = require('../../git/git_commands');

const HEADER_DELIMITER = '---';
const LIST_ITEM_PREFIX = '  - ';

function splitFrontmatter(content, cardPath) {
    const openingDelimiter = /^---(\r?\n)/u.exec(content);
    if (!openingDelimiter) throw new Error(`Card has no frontmatter: ${cardPath}`);
    const lineEnding = openingDelimiter[1];
    const headerStart = openingDelimiter[0].length;
    const closingDelimiter = /\r?\n---\r?\n/gu;
    closingDelimiter.lastIndex = HEADER_DELIMITER.length;
    const closingMatch = closingDelimiter.exec(content);
    if (!closingMatch) throw new Error(`Card has invalid frontmatter: ${cardPath}`);
    const headerEnd = closingMatch.index + closingMatch[0].indexOf(HEADER_DELIMITER);

    return { header: content.slice(headerStart, headerEnd), headerStart, lineEnding };
}

function findTopLevelField(lines, fieldName) {
    const prefix = `${fieldName}:`;

    return lines.findIndex((line) => !line.startsWith(' ') && line.startsWith(prefix));
}

function appendReferenceToContent(content, cardPath, cardInternalId, activityPath) {
    const { header, headerStart, lineEnding } = splitFrontmatter(content, cardPath);
    const headerLines = header.split(/(?<=\n)/u);
    const lines = headerLines.map((line) => line.replace(/\r?\n$/u, ''));
    const identityIndex = findTopLevelField(lines, 'internalId');
    const storedCardInternalId = identityIndex < 0 ? '' : lines[identityIndex].slice('internalId:'.length).trim();
    if (storedCardInternalId !== cardInternalId) {
        throw new Error(`Card identity mismatch at ${cardPath}: expected ${cardInternalId}, found ${storedCardInternalId || 'missing'}`);
    }

    const agentsIndex = findTopLevelField(lines, 'agents');
    let insertionIndex = lines.length;
    let insertedContent = `${LIST_ITEM_PREFIX}${activityPath}${lineEnding}`;
    if (agentsIndex < 0) {
        insertedContent = `agents:${lineEnding}${insertedContent}`;
    } else {
        if (lines[agentsIndex].slice('agents:'.length).trim().length > 0) {
            throw new Error(`Card agents field must be a list: ${cardPath}`);
        }
        insertionIndex = agentsIndex + 1;
        while (insertionIndex < lines.length && lines[insertionIndex].startsWith(LIST_ITEM_PREFIX)) {
            if (lines[insertionIndex].slice(LIST_ITEM_PREFIX.length).trim() === activityPath) return content;
            insertionIndex += 1;
        }
    }

    const insertionOffset = headerStart + headerLines.slice(0, insertionIndex).join('').length;

    return `${content.slice(0, insertionOffset)}${insertedContent}${content.slice(insertionOffset)}`;
}

async function replaceFile(filePath, content, dependencies) {
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
        await dependencies.writeFile(temporaryPath, content, 'utf8');
        await dependencies.rename(temporaryPath, filePath);
    } finally {
        await dependencies.rm(temporaryPath, { force: true });
    }
}

/** Appends one card activity path while preserving all unrelated Markdown bytes. */
async function appendCardActivityReference(project, cardPath, cardInternalId, activityPath, dependencyOverrides = {}) {
    if (typeof cardPath !== 'string' || cardPath.length === 0) throw new Error('Missing card activity cardPath');
    if (typeof cardInternalId !== 'string' || cardInternalId.length === 0) throw new Error('Missing card activity cardInternalId');
    if (typeof activityPath !== 'string' || activityPath.length === 0) throw new Error('Missing card activity path');
    const rootPath = requireRootPath(project);
    const dependencies = {
        assertGitRoot: dependencyOverrides.assertGitRoot ?? assertGitRoot,
        readFile: dependencyOverrides.readFile ?? fs.promises.readFile,
        rename: dependencyOverrides.rename ?? fs.promises.rename,
        rm: dependencyOverrides.rm ?? fs.promises.rm,
        writeFile: dependencyOverrides.writeFile ?? fs.promises.writeFile,
    };
    await dependencies.assertGitRoot(rootPath);
    const filePath = ensureInsideRoot(rootPath, path.join(rootPath, cardPath));
    let content;
    try {
        content = await dependencies.readFile(filePath, 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') throw new Error(`Card file not found: ${cardPath}`, { cause: error });
        throw error;
    }
    const updatedContent = appendReferenceToContent(content, cardPath, cardInternalId, activityPath);
    if (updatedContent === content) return false;

    await replaceFile(filePath, updatedContent, dependencies);

    return true;
}

module.exports = { appendCardActivityReference, appendReferenceToContent };
