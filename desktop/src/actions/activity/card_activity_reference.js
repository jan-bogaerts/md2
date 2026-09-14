const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { assertGitRoot, ensureInsideRoot, requireRootPath } = require('../../git/git_commands');

const HEADER_DELIMITER = '---';
const LIST_ITEM_PREFIX = '  - ';

function splitFrontmatter(content, cardPath) {
    const lineEnding = content.includes('\r\n') ? '\r\n' : '\n';
    if (!content.startsWith(`${HEADER_DELIMITER}${lineEnding}`)) {
        throw new Error(`Card has no frontmatter: ${cardPath}`);
    }
    const closingDelimiter = `${lineEnding}${HEADER_DELIMITER}${lineEnding}`;
    const closingIndex = content.indexOf(closingDelimiter, HEADER_DELIMITER.length);
    if (closingIndex < 0) throw new Error(`Card has invalid frontmatter: ${cardPath}`);

    return {
        body: content.slice(closingIndex),
        header: content.slice(HEADER_DELIMITER.length + lineEnding.length, closingIndex),
        lineEnding,
    };
}

function findTopLevelField(lines, fieldName) {
    const prefix = `${fieldName}:`;

    return lines.findIndex((line) => !line.startsWith(' ') && line.startsWith(prefix));
}

function appendReferenceToContent(content, cardPath, cardInternalId, activityPath) {
    const { body, header, lineEnding } = splitFrontmatter(content, cardPath);
    const lines = header.split(lineEnding);
    const identityIndex = findTopLevelField(lines, 'internalId');
    const storedCardInternalId = identityIndex < 0 ? '' : lines[identityIndex].slice('internalId:'.length).trim();
    if (storedCardInternalId !== cardInternalId) {
        throw new Error(`Card identity mismatch at ${cardPath}: expected ${cardInternalId}, found ${storedCardInternalId || 'missing'}`);
    }

    const agentsIndex = findTopLevelField(lines, 'agents');
    if (agentsIndex < 0) {
        lines.push('agents:', `${LIST_ITEM_PREFIX}${activityPath}`);
    } else {
        if (lines[agentsIndex].slice('agents:'.length).trim().length > 0) {
            throw new Error(`Card agents field must be a list: ${cardPath}`);
        }
        let insertionIndex = agentsIndex + 1;
        while (insertionIndex < lines.length && lines[insertionIndex].startsWith(LIST_ITEM_PREFIX)) {
            if (lines[insertionIndex].slice(LIST_ITEM_PREFIX.length).trim() === activityPath) return content;
            insertionIndex += 1;
        }
        lines.splice(insertionIndex, 0, `${LIST_ITEM_PREFIX}${activityPath}`);
    }

    return `${HEADER_DELIMITER}${lineEnding}${lines.join(lineEnding)}${body}`;
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
