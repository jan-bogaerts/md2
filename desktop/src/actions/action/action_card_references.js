const CARD_REFERENCES_HEADING = 'Card references:';
const FRONTMATTER_DELIMITER = '---';
const LIST_ITEM_PREFIX = '  - ';

function splitFrontmatter(content) {
    if (!content.startsWith(`${FRONTMATTER_DELIMITER}\n`) && !content.startsWith(`${FRONTMATTER_DELIMITER}\r\n`)) return '';

    const closingDelimiter = /\r?\n---(?:\r?\n|$)/gu;
    closingDelimiter.lastIndex = FRONTMATTER_DELIMITER.length;
    const closingMatch = closingDelimiter.exec(content);
    if (!closingMatch) return '';

    const headerStart = content.indexOf('\n') + 1;

    return content.slice(headerStart, closingMatch.index).replace(/\r\n/gu, '\n');
}

function parseCardReferences(content) {
    const lines = splitFrontmatter(content).split('\n');
    const referencesIndex = lines.findIndex((line) => line === 'references:');
    if (referencesIndex === -1) return [];

    const references = [];
    for (const line of lines.slice(referencesIndex + 1)) {
        if (!line.startsWith(LIST_ITEM_PREFIX)) break;
        references.push(line.slice(LIST_ITEM_PREFIX.length).trim());
    }

    return [...new Set(references)];
}

function cardReferencesBlock(references) {
    return `${CARD_REFERENCES_HEADING}\n${references.map((reference) => `- ${reference}`).join('\n')}`;
}

function withoutGeneratedCardReferences(prompt) {
    if (prompt.startsWith(`${CARD_REFERENCES_HEADING}\n`)) {
        const referenceLines = prompt.slice(CARD_REFERENCES_HEADING.length + 1).split('\n');
        if (referenceLines.every((line) => line.startsWith('- '))) return '';
    }

    const separator = `\n\n${CARD_REFERENCES_HEADING}\n`;
    const sectionIndex = prompt.lastIndexOf(separator);
    if (sectionIndex === -1) return prompt;

    const referenceLines = prompt.slice(sectionIndex + separator.length).split('\n');
    if (!referenceLines.every((line) => line.startsWith('- '))) return prompt;

    return prompt.slice(0, sectionIndex);
}

function appendCardReferences(prompt, references) {
    const basePrompt = withoutGeneratedCardReferences(prompt);
    if (references.length === 0) return basePrompt;

    const block = cardReferencesBlock(references);

    return basePrompt.length > 0 ? `${basePrompt}\n\n${block}` : block;
}

async function appendCurrentCardReferences(prompt, context, project, localGitService) {
    if (!context.cardInternalId || !context.file || (context.kind !== 'card' && context.kind !== 'file')) return prompt;

    const cardFile = await localGitService.loadFile(project, context.file);
    const references = parseCardReferences(cardFile.content);

    return appendCardReferences(prompt, references);
}

module.exports = { appendCardReferences, appendCurrentCardReferences, parseCardReferences };
