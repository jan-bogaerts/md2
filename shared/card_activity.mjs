import { parseAgentConversation } from './agent_conversations.mjs'

const ACTIVITY_VERSION = 1
const ACTION_ACTIVITY_STATUSES = new Set(['cancelled', 'completed', 'failed', 'okButNotAfter'])

function requiredString(value, fieldName, allowEmpty = false) {
    if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) throw new Error(`Malformed activity file: missing ${fieldName}`)

    return value
}

function nonNegativeInteger(value, fieldName) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`Malformed activity file: invalid ${fieldName}`)

    return value
}

function requiredStringArray(value, fieldName) {
    if (!Array.isArray(value)) throw new Error(`Malformed activity file: invalid ${fieldName}`)

    return value.map((entry, index) => requiredString(entry, `${fieldName}[${index}]`))
}

function parseOrigin(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed activity file: missing origin')
    if (value.kind === 'project') return { kind: 'project' }
    if (value.kind !== 'card') throw new Error(`Malformed activity file: invalid origin kind ${String(value.kind)}`)

    return { cardInternalId: requiredString(value.cardInternalId, 'origin.cardInternalId'), kind: 'card' }
}

function parseCommit(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid commits[${index}]`)
    const commit = {
        branch: requiredString(value.branch, `commits[${index}].branch`),
        commit: requiredString(value.commit, `commits[${index}].commit`),
        committedAt: requiredString(value.committedAt, `commits[${index}].committedAt`),
        deletions: nonNegativeInteger(value.deletions, `commits[${index}].deletions`),
        filePaths: requiredStringArray(value.filePaths, `commits[${index}].filePaths`),
        filesChanged: nonNegativeInteger(value.filesChanged, `commits[${index}].filesChanged`),
        insertions: nonNegativeInteger(value.insertions, `commits[${index}].insertions`),
    }
    if (!/^[0-9a-f]{40}$/iu.test(commit.commit)) throw new Error(`Malformed activity file: invalid commits[${index}].commit`)
    if (value.available !== undefined) {
        if (typeof value.available !== 'boolean') throw new Error(`Malformed activity file: invalid commits[${index}].available`)
        commit.available = value.available
    }
    if (value.actionId !== undefined || value.actionName !== undefined) {
        commit.actionId = requiredString(value.actionId, `commits[${index}].actionId`)
        commit.actionName = requiredString(value.actionName, `commits[${index}].actionName`)
    }

    return commit
}

function parseHistory(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}].history`)
    const status = requiredString(value.status, `records[${index}].history.status`)
    if (status !== 'completed' && status !== 'failed') throw new Error(`Malformed activity file: invalid records[${index}].history.status`)
    const history = {
        completedAt: requiredString(value.completedAt, `records[${index}].history.completedAt`),
        output: requiredString(value.output, `records[${index}].history.output`, true),
        prompt: requiredString(value.prompt, `records[${index}].history.prompt`, true),
        status,
    }
    for (const fieldName of ['agent', 'command', 'model', 'thinkingLevel']) {
        if (value[fieldName] === undefined) continue
        if (fieldName === 'agent' && value[fieldName] === null) history[fieldName] = null
        else history[fieldName] = requiredString(value[fieldName], `records[${index}].history.${fieldName}`)
    }

    return history
}

function parseRecord(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}]`)
    const status = requiredString(value.status, `records[${index}].status`)
    if (!ACTION_ACTIVITY_STATUSES.has(status)) throw new Error(`Malformed activity file: invalid records[${index}].status`)
    if (!Array.isArray(value.commits)) throw new Error(`Malformed activity file: invalid records[${index}].commits`)
    if (!Array.isArray(value.conversationIds)) throw new Error(`Malformed activity file: invalid records[${index}].conversationIds`)

    return {
        commits: value.commits.map(parseCommit),
        completedAt: requiredString(value.completedAt, `records[${index}].completedAt`),
        conversationIds: requiredStringArray(value.conversationIds, `records[${index}].conversationIds`),
        executionId: requiredString(value.executionId, `records[${index}].executionId`),
        history: parseHistory(value.history, index),
        origin: parseOrigin(value.origin),
        rootActionId: requiredString(value.rootActionId, `records[${index}].rootActionId`),
        rootActionLabel: requiredString(value.rootActionLabel, `records[${index}].rootActionLabel`),
        startedAt: requiredString(value.startedAt, `records[${index}].startedAt`),
        status,
    }
}

function parseConversation(value, index) {
    try {
        const parsed = parseAgentConversation(JSON.stringify(value), '')

        return Object.fromEntries(Object.entries(parsed).filter(([fieldName]) => fieldName !== 'path'))
    } catch (error) {
        const detail = error instanceof Error ? error.message : 'invalid conversation'
        throw new Error(`Malformed activity file: conversations[${index}] ${detail}`, { cause: error })
    }
}

export function createActivityFile(origin) {
    return { conversations: [], origin: parseOrigin(origin), records: [], version: ACTIVITY_VERSION }
}

export function parseActivityFile(content, expectedOrigin = null) {
    const value = JSON.parse(content)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed activity file: root must be an object')
    if (value.version !== ACTIVITY_VERSION) throw new Error(`Malformed activity file: unsupported version ${String(value.version)}`)
    if (!Array.isArray(value.records)) throw new Error('Malformed activity file: records must be an array')
    if (!Array.isArray(value.conversations)) throw new Error('Malformed activity file: conversations must be an array')
    const origin = parseOrigin(value.origin)
    if (expectedOrigin) {
        const expected = parseOrigin(expectedOrigin)
        if (origin.kind !== expected.kind || origin.cardInternalId !== expected.cardInternalId) {
            throw new Error('Malformed activity file: origin does not match requested activity')
        }
    }

    return {
        conversations: value.conversations.map(parseConversation),
        origin,
        records: value.records.map(parseRecord),
        version: ACTIVITY_VERSION,
    }
}

export function findActivityConversation(activity, conversationId) {
    const conversation = activity.conversations.find(({ id }) => id === conversationId)
    if (!conversation) throw new Error(`Activity conversation not found: ${conversationId}`)

    return conversation
}
