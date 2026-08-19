import { activityOriginFromPath } from './activity_paths.mjs'
import { parseActivityFileForMigration } from './card_activity.mjs'

const RELEASE_STATS_VERSION = 2
const CONVERSATION_STATUSES = new Set(['cancelled', 'completed', 'failed', 'running', 'waitingForInput'])
const COMPLETED_ACTION_STATUSES = new Set(['completed', 'okButNotAfter'])
const CODEX_TOOL_EVENT_TYPES = new Set([
    'collabAgentToolCall',
    'commandExecution',
    'dynamicToolCall',
    'fileChange',
    'imageView',
    'mcpToolCall',
    'webSearch',
])

function requiredObject(value, fieldName) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Malformed project stats: invalid ${fieldName}`)

    return value
}

function requiredString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Malformed project stats: invalid ${fieldName}`)

    return value
}

function nullableString(value, fieldName) {
    if (value === null) return null

    return requiredString(value, fieldName)
}

function requiredTimestamp(value, fieldName) {
    const timestamp = requiredString(value, fieldName)
    if (Number.isNaN(Date.parse(timestamp))) throw new Error(`Malformed project stats: invalid ${fieldName}`)

    return timestamp
}

function nullableTimestamp(value, fieldName) {
    if (value === null) return null

    return requiredTimestamp(value, fieldName)
}

function nullableNonNegativeNumber(value, fieldName) {
    if (value === null) return null
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`Malformed project stats: invalid ${fieldName}`)
    }

    return value
}

function nonNegativeNumber(value, fieldName) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`Malformed project stats: invalid ${fieldName}`)
    }

    return value
}

function requiredBoolean(value, fieldName) {
    if (typeof value !== 'boolean') throw new Error(`Malformed project stats: invalid ${fieldName}`)

    return value
}

function parseAction(value, fieldName) {
    const action = requiredObject(value, fieldName)

    return {
        actionId: requiredString(action.actionId, `${fieldName}.actionId`),
        actionLabel: requiredString(action.actionLabel, `${fieldName}.actionLabel`),
        cardInternalId: nullableString(action.cardInternalId, `${fieldName}.cardInternalId`),
        completedAt: requiredTimestamp(action.completedAt, `${fieldName}.completedAt`),
        identity: requiredString(action.identity, `${fieldName}.identity`),
    }
}

function parseConversation(value, fieldName) {
    const conversation = requiredObject(value, fieldName)
    const status = requiredString(conversation.status, `${fieldName}.status`)
    if (!CONVERSATION_STATUSES.has(status)) throw new Error(`Malformed project stats: invalid ${fieldName}.status`)

    return {
        actionId: nullableString(conversation.actionId, `${fieldName}.actionId`),
        actionLabel: nullableString(conversation.actionLabel, `${fieldName}.actionLabel`),
        agent: nullableString(conversation.agent, `${fieldName}.agent`),
        cardInternalId: nullableString(conversation.cardInternalId, `${fieldName}.cardInternalId`),
        cardPath: nullableString(conversation.cardPath, `${fieldName}.cardPath`),
        completedAt: nullableTimestamp(conversation.completedAt, `${fieldName}.completedAt`),
        elapsedMs: nullableNonNegativeNumber(conversation.elapsedMs, `${fieldName}.elapsedMs`),
        hasMixedAttribution: requiredBoolean(conversation.hasMixedAttribution, `${fieldName}.hasMixedAttribution`),
        hasNestedAgentConversations: requiredBoolean(
            conversation.hasNestedAgentConversations,
            `${fieldName}.hasNestedAgentConversations`,
        ),
        identity: requiredString(conversation.identity, `${fieldName}.identity`),
        isRootConversation: requiredBoolean(conversation.isRootConversation, `${fieldName}.isRootConversation`),
        model: nullableString(conversation.model, `${fieldName}.model`),
        status,
        toolCallCount: nonNegativeNumber(conversation.toolCallCount, `${fieldName}.toolCallCount`),
        totalTokens: nonNegativeNumber(conversation.totalTokens, `${fieldName}.totalTokens`),
    }
}

function parseArray(value, fieldName, parseEntry) {
    if (!Array.isArray(value)) throw new Error(`Malformed project stats: invalid ${fieldName}`)

    return value.map((entry, index) => parseEntry(entry, `${fieldName}[${index}]`))
}

function requireUniqueIdentities(entries, fieldName) {
    const identities = new Set()
    for (const entry of entries) {
        if (identities.has(entry.identity)) throw new Error(`Malformed project stats: duplicate ${fieldName} identity ${entry.identity}`)
        identities.add(entry.identity)
    }

    return entries
}

function originIdentity(origin) {
    return origin.kind === 'card' ? `card:${origin.cardInternalId}` : 'project'
}

function isToolCallEvent(entry) {
    if (entry.kind !== 'event') return false
    if (entry.type.startsWith('tool.')) return entry.type !== 'tool.result'

    return CODEX_TOOL_EVENT_TYPES.has(entry.type)
}

function toolCallCount(entries) {
    return new Set(entries.filter(isToolCallEvent).map((entry) => entry.providerItemId ?? entry.id)).size
}

function conversationAttribution(records, conversationId) {
    const rootRecords = records.filter((record) => (
        record.type !== 'system'
        && record.details.type === 'agent'
        && record.rootConversationId === conversationId
    ))
    const pairs = new Set(rootRecords.flatMap(({ details }) => (
        details.agent && details.model ? [`${details.agent}\u0000${details.model}`] : []
    )))
    const hasMissingAttribution = rootRecords.some(({ details }) => !details.agent || !details.model)
    const hasMixedAttribution = pairs.size > 1
    const validPair = !hasMissingAttribution && !hasMixedAttribution ? [...pairs][0] : null
    const [agent, model] = validPair ? validPair.split('\u0000') : [null, null]

    return {
        agent,
        hasMixedAttribution,
        hasNestedAgentConversations: rootRecords.some(({ conversationIds, rootConversationId }) => (
            conversationIds.some((referencedId) => referencedId !== rootConversationId)
        )),
        isRootConversation: rootRecords.length > 0,
        model,
    }
}

export function projectStatsFilePath(projectFolder) {
    if (typeof projectFolder !== 'string') throw new Error('Missing project folder')
    const normalizedFolder = projectFolder.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')

    return normalizedFolder.length > 0 ? `${normalizedFolder}/project_stats.json` : 'project_stats.json'
}

/** Reduce canonical activity to chart facts without conversation transcript entries. */
export function calculateActivityStats(activityFiles) {
    if (!Array.isArray(activityFiles)) throw new Error('Activity files must be an array')
    const actions = new Map()
    const conversations = new Map()
    for (const activity of activityFiles) {
        const labels = new Map()
        for (const record of activity.records) {
            if (record.type !== 'system') labels.set(record.rootActionId, record.rootActionLabel)
            if (record.type === 'system' || !COMPLETED_ACTION_STATUSES.has(record.status)) continue
            const identity = `${originIdentity(record.origin)}:${record.runId}`
            if (actions.has(identity)) continue
            actions.set(identity, {
                actionId: record.rootActionId,
                actionLabel: record.rootActionLabel,
                cardInternalId: record.origin.kind === 'card' ? record.origin.cardInternalId : null,
                completedAt: record.completedAt,
                identity,
            })
        }
        for (const conversation of activity.conversations) {
            const identity = `${originIdentity(activity.origin)}:${conversation.id}`
            if (conversations.has(identity)) continue
            const attribution = conversationAttribution(activity.records, conversation.id)
            const cardInternalId = conversation.cardInternalId
                ?? (activity.origin.kind === 'card' ? activity.origin.cardInternalId : null)
            conversations.set(identity, {
                actionId: conversation.actionId ?? null,
                actionLabel: conversation.actionId ? labels.get(conversation.actionId) ?? conversation.title : null,
                agent: attribution.agent,
                cardInternalId,
                cardPath: conversation.cardPath,
                completedAt: conversation.completedAt,
                elapsedMs: conversation.timer?.elapsedMs ?? null,
                hasMixedAttribution: attribution.hasMixedAttribution,
                hasNestedAgentConversations: attribution.hasNestedAgentConversations,
                identity,
                isRootConversation: attribution.isRootConversation,
                model: attribution.model,
                status: conversation.status,
                toolCallCount: toolCallCount(conversation.entries),
                totalTokens: conversation.usage?.totalTokens ?? 0,
            })
        }
    }

    return { actions: [...actions.values()], conversations: [...conversations.values()] }
}

/** Parse independent activity sources and keep valid facts when another source fails. */
export function calculateActivityStatsFromSources(sources) {
    if (!Array.isArray(sources)) throw new Error('Activity sources must be an array')
    const activityFiles = []
    const warnings = []
    for (const source of sources) {
        const path = typeof source?.path === 'string' ? source.path : 'unknown activity source'
        try {
            if (typeof source?.content !== 'string') throw new Error('missing content')
            const origin = activityOriginFromPath(path)
            if (!origin) throw new Error('invalid activity path')
            activityFiles.push(parseActivityFileForMigration(source.content, origin))
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            warnings.push(`${path}: ${detail}`)
        }
    }

    return { stats: calculateActivityStats(activityFiles), warnings }
}

export function parseReleaseStats(value, fieldName = 'release') {
    const release = requiredObject(value, fieldName)

    return {
        actions: requireUniqueIdentities(parseArray(release.actions, `${fieldName}.actions`, parseAction), `${fieldName}.actions`),
        conversations: requireUniqueIdentities(
            parseArray(release.conversations, `${fieldName}.conversations`, parseConversation),
            `${fieldName}.conversations`,
        ),
    }
}

/** Strictly parse root schema while isolating malformed release entries as warnings. */
export function parseProjectStatsFile(content, referencePath) {
    const parsed = requiredObject(JSON.parse(content), 'root')
    if (parsed.version !== RELEASE_STATS_VERSION) {
        throw new Error(`Malformed project stats: unsupported version ${String(parsed.version)}`)
    }
    const releasesValue = requiredObject(parsed.releases, 'releases')
    const releases = {}
    const warnings = []
    for (const [releaseName, value] of Object.entries(releasesValue)) {
        try {
            releases[requiredString(releaseName, 'release name')] = parseReleaseStats(value, `releases.${releaseName}`)
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            warnings.push(`${referencePath}: ${releaseName}: ${detail}`)
        }
    }

    return { releases, warnings }
}

export function serializeProjectStats(releases) {
    const normalizedReleases = Object.fromEntries(
        Object.entries(releases)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([releaseName, release]) => [releaseName, parseReleaseStats(release, `releases.${releaseName}`)]),
    )

    return `${JSON.stringify({ releases: normalizedReleases, version: RELEASE_STATS_VERSION }, null, 2)}\n`
}

export { RELEASE_STATS_VERSION }
