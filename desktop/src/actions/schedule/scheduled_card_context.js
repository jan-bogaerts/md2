const { parseHeaderFields, splitHeader } = require('../../../../shared/markdown_header_fields.mjs');

const CARD_ID_PATTERN = /^(.+?)[-_]\d+$/u;

function requireCardField(fields, fieldName, cardInternalId) {
    const value = fields[fieldName];
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`Sequence card ${cardInternalId} has no ${fieldName}`);
    }

    return value.trim();
}

function parseCard(file) {
    const { hasHeader, rawHeader } = splitHeader(file.content);
    if (!hasHeader) return null;
    const fields = parseHeaderFields(rawHeader);
    if (typeof fields.internalId !== 'string' || fields.internalId.trim().length === 0) return null;

    return { fields, path: file.path };
}

function resolveCardType(cardId, cardTypes, cardInternalId) {
    if (!Array.isArray(cardTypes)) throw new Error('Missing project card types');
    const idPrefix = cardId.match(CARD_ID_PATTERN)?.[1];
    const cardType = cardTypes.find((candidate) => candidate?.idPrefix === idPrefix);
    if (!cardType || typeof cardType.type !== 'string' || cardType.type.length === 0) {
        throw new Error(`Sequence card ${cardInternalId} has no configured type`);
    }

    return cardType.type;
}

/** Resolves current card fields by stable internal identity and builds a fresh action context. */
function resolveScheduledCardContext(files, cardTypes, cardInternalId) {
    const matches = files.map(parseCard).filter((card) => card?.fields.internalId.trim() === cardInternalId);
    if (matches.length === 0) throw new Error(`Sequence card not found: ${cardInternalId}`);
    if (matches.length > 1) throw new Error(`Duplicate sequence card identity: ${cardInternalId}`);
    const { fields, path } = matches[0];
    const id = requireCardField(fields, 'id', cardInternalId);
    const state = requireCardField(fields, 'status', cardInternalId);
    const title = requireCardField(fields, 'title', cardInternalId);
    const type = resolveCardType(id, cardTypes, cardInternalId);
    const context = { cardInternalId, file: path, kind: 'card', state, title, type };
    if (typeof fields.worktree === 'string' && fields.worktree.trim().length > 0) {
        context.worktree = fields.worktree.trim();
    }

    return context;
}

module.exports = { resolveScheduledCardContext };
