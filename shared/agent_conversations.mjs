import { normalizeAgentTokenUsage } from './agent_usage_math.mjs'

const AGENT_MESSAGE_ROLES = new Set(['assistant', 'user'])
const AGENT_STATUSES = new Set(['cancelled', 'completed', 'failed', 'running', 'waitingForInput'])
const INTERNAL_EVENT_TYPES = new Set(['closed', 'started', 'turnCompleted'])
export const AGENT_CONVERSATION_USAGE_SCHEMA_VERSION = 1

function requiredString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Malformed agent conversation: missing ${fieldName}`)

    return value
}

function optionalString(value) {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function optionalInteger(value) {
    return Number.isSafeInteger(value) ? value : null
}

function optionalNonNegativeInteger(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : null
}

function optionalNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function optionalStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? [...value] : null
}

function normalizeMessage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    if (!AGENT_MESSAGE_ROLES.has(value.role)) return null
    if (typeof value.content !== 'string') return null
    const id = optionalString(value.id)
    const timestamp = optionalString(value.timestamp)
    if (!id || !timestamp) return null
    const agent = optionalString(value.agent)
    const sequence = optionalInteger(value.sequence)

    return {
        ...(agent ? { agent } : {}),
        content: value.content,
        id,
        kind: 'message',
        role: value.role,
        ...(sequence !== null ? { sequence } : {}),
        timestamp,
    }
}

function normalizeEvent(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    if (typeof value.content !== 'string') return null
    const id = optionalString(value.id)
    const timestamp = optionalString(value.timestamp)
    const type = optionalString(value.type)
    if (!id || !timestamp || !type) return null
    const command = optionalString(value.command)
    const deletions = optionalNonNegativeInteger(value.deletions)
    const details = optionalStringArray(value.details)
    const durationMs = optionalNumber(value.durationMs)
    const exitCode = optionalInteger(value.exitCode)
    const insertions = optionalNonNegativeInteger(value.insertions)
    const label = optionalString(value.label)
    const output = value.type !== 'commandExecution' && typeof value.output === 'string' ? value.output : null
    const providerItemId = optionalString(value.providerItemId)
    const sequence = optionalInteger(value.sequence)
    const status = optionalString(value.status)
    const summary = optionalStringArray(value.summary)
    const workingDirectory = optionalString(value.workingDirectory)

    return {
        ...(command ? { command } : {}),
        content: value.content,
        ...(deletions !== null ? { deletions } : {}),
        ...(details ? { details } : {}),
        ...(durationMs !== null ? { durationMs } : {}),
        ...(exitCode !== null ? { exitCode } : {}),
        id,
        ...(insertions !== null ? { insertions } : {}),
        kind: 'event',
        ...(label ? { label } : {}),
        ...(output !== null ? { output } : {}),
        ...(providerItemId ? { providerItemId } : {}),
        ...(sequence !== null ? { sequence } : {}),
        ...(status ? { status } : {}),
        ...(summary ? { summary } : {}),
        timestamp,
        type,
        ...(workingDirectory ? { workingDirectory } : {}),
    }
}

function normalizeProviderSession(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const agent = optionalString(value.agent)
    const conversationId = optionalString(value.conversationId)
    const createdAt = optionalString(value.createdAt)
    const lastUsedAt = optionalString(value.lastUsedAt)
    const synchronizedThroughMessageId = optionalString(value.synchronizedThroughMessageId)
    if (!agent || !conversationId || !createdAt || !lastUsedAt || !synchronizedThroughMessageId) return null

    return { agent, conversationId, createdAt, lastUsedAt, synchronizedThroughMessageId }
}

function normalizeContextWindowUsage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const { capacityTokens, usedTokens } = value
    if (!Number.isSafeInteger(usedTokens) || usedTokens < 0) return null
    if (!Number.isSafeInteger(capacityTokens) || capacityTokens <= 0) return null

    return { capacityTokens, usedTokens }
}

function normalizeTimer(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Malformed agent conversation: invalid timer')
    }
    const { elapsedMs, runningStartedAt } = value
    if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0) {
        throw new Error('Malformed agent conversation: invalid timer.elapsedMs')
    }
    if (runningStartedAt !== null
        && (typeof runningStartedAt !== 'string' || Number.isNaN(Date.parse(runningStartedAt)))) {
        throw new Error('Malformed agent conversation: invalid timer.runningStartedAt')
    }

    return { elapsedMs, runningStartedAt }
}

function normalizeArray(value, normalize) {
    if (!Array.isArray(value)) return []

    return value.map(normalize).filter((entry) => entry !== null)
}

function coalesceDiagnosticEntries(entries) {
    const groupedEntries = []
    for (const entry of entries) {
        const previousEntry = groupedEntries.at(-1)
        if (entry.kind === 'event' && entry.type === 'diagnostic'
            && previousEntry?.kind === 'event' && previousEntry.type === 'diagnostic') {
            groupedEntries[groupedEntries.length - 1] = {
                ...previousEntry,
                content: `${previousEntry.content}\n${entry.content}`,
            }
            continue
        }
        groupedEntries.push(entry)
    }

    return groupedEntries
}

function isConversationEntry(entry) {
    if (entry.kind !== 'event') return true
    if (INTERNAL_EVENT_TYPES.has(entry.type)) return false

    return entry.type !== 'error' || typeof entry.providerItemId === 'string'
}

function normalizeEntries(value) {
    if (!Array.isArray(value)) throw new Error('Malformed agent conversation: missing entries')

    const entries = value.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error(`Malformed agent conversation: invalid entries[${index}]`)
        }
        const normalized = entry.kind === 'message'
            ? normalizeMessage(entry)
            : entry.kind === 'event'
                ? normalizeEvent(entry)
                : null
        if (!normalized) throw new Error(`Malformed agent conversation: invalid entries[${index}]`)

        return normalized
    })

    return coalesceDiagnosticEntries(entries.filter(isConversationEntry))
}

/** Parse one canonical conversation record and validate every ordered entry. */
export function parseAgentConversation(content, referencePath) {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Malformed agent conversation: root must be an object')
    const id = requiredString(parsed.id, 'id')
    const status = requiredString(parsed.status, 'status')
    if (!AGENT_STATUSES.has(status)) throw new Error(`Malformed agent conversation: invalid status ${status}`)
    const startedAt = requiredString(parsed.startedAt, 'startedAt')
    const hasExplicitTitle = typeof parsed.title === 'string' && parsed.title.trim().length > 0
    const contextWindowUsage = normalizeContextWindowUsage(parsed.contextWindowUsage)
    const usage = normalizeAgentTokenUsage(parsed.usage)
    if (parsed.usageSchemaVersion !== undefined
        && parsed.usageSchemaVersion !== AGENT_CONVERSATION_USAGE_SCHEMA_VERSION) {
        throw new Error(`Malformed agent conversation: unsupported usageSchemaVersion ${String(parsed.usageSchemaVersion)}`)
    }
    if (usage && parsed.usageSchemaVersion === undefined
        && typeof parsed.usage.totalTokens === 'number'
        && Number.isFinite(parsed.usage.totalTokens)
        && parsed.usage.totalTokens >= 0) {
        usage.totalTokens = parsed.usage.totalTokens
    }
    if (usage && parsed.usageSchemaVersion === AGENT_CONVERSATION_USAGE_SCHEMA_VERSION
        && parsed.usage.totalTokens !== usage.totalTokens) {
        throw new Error('Malformed agent conversation: inconsistent usage.totalTokens')
    }
    const timer = parsed.timer === undefined ? null : normalizeTimer(parsed.timer)
    if (parsed.viewed !== undefined && typeof parsed.viewed !== 'boolean') {
        throw new Error('Malformed agent conversation: invalid viewed')
    }

    return {
        actionId: optionalString(parsed.actionId),
        cardInternalId: optionalString(parsed.cardInternalId),
        cardPath: optionalString(parsed.cardPath),
        completedAt: optionalString(parsed.completedAt),
        ...(contextWindowUsage ? { contextWindowUsage } : {}),
        entries: normalizeEntries(parsed.entries),
        hasExplicitTitle,
        id,
        path: referencePath,
        providerSessions: normalizeArray(parsed.providerSessions, normalizeProviderSession),
        startedAt,
        status,
        ...(timer ? { timer } : {}),
        title: hasExplicitTitle ? parsed.title : id,
        ...(usage ? { usage } : {}),
        ...(parsed.usageSchemaVersion !== undefined ? { usageSchemaVersion: parsed.usageSchemaVersion } : {}),
        viewed: parsed.viewed ?? true,
    }
}
