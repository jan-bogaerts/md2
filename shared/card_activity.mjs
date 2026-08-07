import { parseAgentConversation } from './agent_conversations.mjs'

const ACTIVITY_VERSION = 3
export const LEGACY_ACTIVITY_VERSION = 1
export const PREVIOUS_ACTIVITY_VERSION = 2
const ACTION_ACTIVITY_STATUSES = new Set(['cancelled', 'completed', 'failed', 'okButNotAfter'])

function requiredString(value, fieldName, allowEmpty = false) {
    if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) throw new Error(`Malformed activity file: missing ${fieldName}`)

    return value
}

function requiredTimestamp(value, fieldName) {
    const timestamp = requiredString(value, fieldName)
    if (Number.isNaN(Date.parse(timestamp))) throw new Error(`Malformed activity file: invalid ${fieldName}`)

    return timestamp
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

function parseActionSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Malformed activity file: actionSettings must be an object')
    }

    return Object.fromEntries(Object.entries(value).map(([actionId, settings]) => {
        if (actionId.length === 0) throw new Error('Malformed activity file: actionSettings action ID must not be empty')
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            throw new Error(`Malformed activity file: invalid actionSettings.${actionId}`)
        }

        return [actionId, {
            accessLevel: requiredString(settings.accessLevel, `actionSettings.${actionId}.accessLevel`, true),
            agent: requiredString(settings.agent, `actionSettings.${actionId}.agent`, true),
            approvalPolicy: requiredString(settings.approvalPolicy, `actionSettings.${actionId}.approvalPolicy`, true),
            model: requiredString(settings.model, `actionSettings.${actionId}.model`, true),
            thinkingLevel: requiredString(settings.thinkingLevel, `actionSettings.${actionId}.thinkingLevel`, true),
        }]
    }))
}

function sameOrigin(first, second) {
    return first.kind === second.kind && first.cardInternalId === second.cardInternalId
}

function parseCommit(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid commits[${index}]`)
    const commit = {
        branch: requiredString(value.branch, `commits[${index}].branch`),
        commit: requiredString(value.commit, `commits[${index}].commit`),
        committedAt: requiredTimestamp(value.committedAt, `commits[${index}].committedAt`),
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

function parseLegacyHistory(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}].history`)
    const status = requiredString(value.status, `records[${index}].history.status`)
    if (status !== 'completed' && status !== 'failed') throw new Error(`Malformed activity file: invalid records[${index}].history.status`)
    const history = {
        completedAt: requiredTimestamp(value.completedAt, `records[${index}].history.completedAt`),
        output: requiredString(value.output, `records[${index}].history.output`, true),
        prompt: requiredString(value.prompt, `records[${index}].history.prompt`, true),
        status,
    }
    for (const fieldName of ['accessLevel', 'agent', 'approvalPolicy', 'command', 'model', 'thinkingLevel']) {
        if (value[fieldName] === undefined) continue
        if (fieldName === 'agent' && value[fieldName] === null) history[fieldName] = null
        else history[fieldName] = requiredString(value[fieldName], `records[${index}].history.${fieldName}`)
    }

    return history
}

function parseAgentDetails(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}].details`)
    const details = { type: 'agent' }
    for (const fieldName of ['accessLevel', 'agent', 'approvalPolicy', 'model', 'thinkingLevel']) {
        if (value[fieldName] === undefined) continue
        if (fieldName === 'agent' && value[fieldName] === null) details[fieldName] = null
        else details[fieldName] = requiredString(value[fieldName], `records[${index}].details.${fieldName}`)
    }

    return details
}

function parseCommandDetails(value, index) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}].details`)

    return {
        command: requiredString(value.command, `records[${index}].details.command`, true),
        output: requiredString(value.output, `records[${index}].details.output`, true),
        type: 'command',
    }
}

function parseDetails(value, index) {
    if (value?.type === 'agent') return parseAgentDetails(value, index)
    if (value?.type === 'command') return parseCommandDetails(value, index)

    throw new Error(`Malformed activity file: invalid records[${index}].details.type`)
}

function parseSystemRecord(value, index, activityOrigin) {
    if (!Array.isArray(value.commits) || value.commits.length !== 1) {
        throw new Error(`Malformed activity file: system records[${index}].commits must contain one commit`)
    }
    const origin = parseOrigin(value.origin)
    if (!sameOrigin(origin, activityOrigin)) throw new Error(`Malformed activity file: records[${index}].origin does not match activity origin`)

    return {
        commits: value.commits.map(parseCommit),
        completedAt: requiredTimestamp(value.completedAt, `records[${index}].completedAt`),
        label: requiredString(value.label, `records[${index}].label`),
        origin,
        type: 'system',
    }
}

function parseRecord(value, index, activityOrigin) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}]`)
    if (value.type === 'system') return parseSystemRecord(value, index, activityOrigin)
    const status = requiredString(value.status, `records[${index}].status`)
    if (!ACTION_ACTIVITY_STATUSES.has(status)) throw new Error(`Malformed activity file: invalid records[${index}].status`)
    if (!Array.isArray(value.commits)) throw new Error(`Malformed activity file: invalid records[${index}].commits`)
    if (!Array.isArray(value.conversationIds)) throw new Error(`Malformed activity file: invalid records[${index}].conversationIds`)

    const origin = parseOrigin(value.origin)
    if (!sameOrigin(origin, activityOrigin)) throw new Error(`Malformed activity file: records[${index}].origin does not match activity origin`)

    if (value.history !== undefined) throw new Error(`Malformed activity file: records[${index}].history is not supported`)
    const details = parseDetails(value.details, index)
    if (details.type === 'command' && value.rootConversationId !== undefined) {
        throw new Error(`Malformed activity file: command records[${index}] cannot have rootConversationId`)
    }
    const record = {
        commits: value.commits.map(parseCommit),
        completedAt: requiredTimestamp(value.completedAt, `records[${index}].completedAt`),
        conversationIds: requiredStringArray(value.conversationIds, `records[${index}].conversationIds`),
        details,
        runId: requiredString(value.runId, `records[${index}].runId`),
        origin,
        rootActionId: requiredString(value.rootActionId, `records[${index}].rootActionId`),
        rootActionLabel: requiredString(value.rootActionLabel, `records[${index}].rootActionLabel`),
        startedAt: requiredTimestamp(value.startedAt, `records[${index}].startedAt`),
        status,
    }
    if (details.type === 'agent') record.rootConversationId = requiredString(value.rootConversationId, `records[${index}].rootConversationId`)

    return record
}

function parseLegacyRecord(value, index, activityOrigin) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed activity file: invalid records[${index}]`)
    if (value.type === 'system') return parseSystemRecord(value, index, activityOrigin)
    const status = requiredString(value.status, `records[${index}].status`)
    if (!ACTION_ACTIVITY_STATUSES.has(status)) throw new Error(`Malformed activity file: invalid records[${index}].status`)
    if (!Array.isArray(value.commits)) throw new Error(`Malformed activity file: invalid records[${index}].commits`)
    const origin = parseOrigin(value.origin)
    if (!sameOrigin(origin, activityOrigin)) throw new Error(`Malformed activity file: records[${index}].origin does not match activity origin`)

    return {
        commits: value.commits.map(parseCommit),
        completedAt: requiredTimestamp(value.completedAt, `records[${index}].completedAt`),
        conversationIds: requiredStringArray(value.conversationIds, `records[${index}].conversationIds`),
        history: parseLegacyHistory(value.history, index),
        origin,
        rootActionId: requiredString(value.rootActionId, `records[${index}].rootActionId`),
        rootActionLabel: requiredString(value.rootActionLabel, `records[${index}].rootActionLabel`),
        runId: requiredString(value.runId, `records[${index}].runId`),
        startedAt: requiredTimestamp(value.startedAt, `records[${index}].startedAt`),
        status,
    }
}

function parseConversation(value, index, activityOrigin) {
    try {
        const parsed = parseAgentConversation(JSON.stringify(value), '')
        const expectedCardInternalId = activityOrigin.kind === 'card' ? activityOrigin.cardInternalId : null
        if (parsed.cardInternalId !== expectedCardInternalId) throw new Error('conversation cardInternalId does not match activity origin')

        return Object.fromEntries(Object.entries(parsed).filter(([fieldName]) => fieldName !== 'path'))
    } catch (error) {
        const detail = error instanceof Error ? error.message : 'invalid conversation'
        throw new Error(`Malformed activity file: conversations[${index}] ${detail}`, { cause: error })
    }
}

export function createActivityFile(origin) {
    return { actionSettings: {}, conversations: [], origin: parseOrigin(origin), records: [], version: ACTIVITY_VERSION }
}

export function parseActivityValue(value, expectedOrigin = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed activity file: root must be an object')
    if (value.version !== ACTIVITY_VERSION) throw new Error(`Malformed activity file: unsupported version ${String(value.version)}`)
    if (!Array.isArray(value.records)) throw new Error('Malformed activity file: records must be an array')
    if (!Array.isArray(value.conversations)) throw new Error('Malformed activity file: conversations must be an array')
    const actionSettings = parseActionSettings(value.actionSettings)
    const origin = parseOrigin(value.origin)
    if (expectedOrigin) {
        const expected = parseOrigin(expectedOrigin)
        if (!sameOrigin(origin, expected)) {
            throw new Error('Malformed activity file: origin does not match requested activity')
        }
    }

    const conversations = value.conversations.map((conversation, index) => parseConversation(conversation, index, origin))
    const records = value.records.map((record, index) => parseRecord(record, index, origin))
    for (const [index, record] of records.entries()) {
        if (record.type === 'system' || record.details.type !== 'agent') continue
        if (!record.conversationIds.includes(record.rootConversationId)) {
            throw new Error(`Malformed activity file: records[${index}].rootConversationId is not in conversationIds`)
        }
        const conversation = conversations.find(({ id }) => id === record.rootConversationId)
        if (!conversation) throw new Error(`Malformed activity file: records[${index}].rootConversationId does not resolve`)
        if (conversation.actionId !== record.rootActionId) {
            throw new Error(`Malformed activity file: records[${index}].rootConversationId action does not match rootActionId`)
        }
    }

    return {
        actionSettings,
        conversations,
        origin,
        records,
        version: ACTIVITY_VERSION,
    }
}

function migrateLegacyRecord(record, index, conversations) {
    if (record.type === 'system') return record
    const { history, ...base } = record
    const agentRecord = history.agent !== undefined
        || history.accessLevel !== undefined
        || history.approvalPolicy !== undefined
        || history.model !== undefined
        || history.thinkingLevel !== undefined
    if (!agentRecord) {
        return {
            ...base,
            details: { command: history.command ?? '', output: history.output, type: 'command' },
        }
    }

    const candidates = conversations.filter((conversation) => (
        record.conversationIds.includes(conversation.id) && conversation.actionId === record.rootActionId
    ))
    if (candidates.length !== 1) {
        throw new Error(`Cannot migrate activity file: agent records[${index}] has ${candidates.length} matching root conversations`)
    }
    const details = Object.fromEntries(Object.entries({
        accessLevel: history.accessLevel,
        agent: history.agent,
        approvalPolicy: history.approvalPolicy,
        model: history.model,
        thinkingLevel: history.thinkingLevel,
        type: 'agent',
    }).filter(([, fieldValue]) => fieldValue !== undefined))

    return { ...base, details, rootConversationId: candidates[0].id }
}

export function migrateActivityValue(value, expectedOrigin = null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed activity file: root must be an object')
    if (value.version !== LEGACY_ACTIVITY_VERSION && value.version !== PREVIOUS_ACTIVITY_VERSION) {
        throw new Error(`Cannot migrate activity file version ${String(value.version)}`)
    }
    if (value.version === PREVIOUS_ACTIVITY_VERSION) {
        return parseActivityValue({ ...value, actionSettings: {}, version: ACTIVITY_VERSION }, expectedOrigin)
    }
    if (!Array.isArray(value.records)) throw new Error('Malformed activity file: records must be an array')
    if (!Array.isArray(value.conversations)) throw new Error('Malformed activity file: conversations must be an array')
    const origin = parseOrigin(value.origin)
    if (expectedOrigin && !sameOrigin(origin, parseOrigin(expectedOrigin))) {
        throw new Error('Malformed activity file: origin does not match requested activity')
    }
    const conversations = value.conversations.map((conversation, index) => parseConversation(conversation, index, origin))
    const legacyRecords = value.records.map((record, index) => parseLegacyRecord(record, index, origin))
    const migrated = {
        actionSettings: {},
        conversations,
        origin,
        records: legacyRecords.map((record, index) => migrateLegacyRecord(record, index, conversations)),
        version: ACTIVITY_VERSION,
    }

    return parseActivityValue(migrated, expectedOrigin)
}

export function parseActivityFile(content, expectedOrigin = null) {
    return parseActivityValue(JSON.parse(content), expectedOrigin)
}

export function findActivityConversation(activity, conversationId) {
    const conversation = activity.conversations.find(({ id }) => id === conversationId)
    if (!conversation) throw new Error(`Activity conversation not found: ${conversationId}`)
    return conversation
}
