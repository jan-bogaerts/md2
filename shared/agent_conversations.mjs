import { normalizeAgentTokenUsage } from './agent_usage_math.mjs'

const AGENT_MESSAGE_ROLES = new Set(['assistant', 'user'])
const AGENT_STATUSES = new Set(['cancelled', 'completed', 'failed', 'running', 'waitingForInput'])

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
    const details = optionalStringArray(value.details)
    const durationMs = optionalNumber(value.durationMs)
    const exitCode = optionalInteger(value.exitCode)
    const label = optionalString(value.label)
    const output = typeof value.output === 'string' ? value.output : null
    const providerItemId = optionalString(value.providerItemId)
    const sequence = optionalInteger(value.sequence)
    const status = optionalString(value.status)
    const summary = optionalStringArray(value.summary)
    const workingDirectory = optionalString(value.workingDirectory)

    return {
        ...(command ? { command } : {}),
        content: value.content,
        ...(details ? { details } : {}),
        ...(durationMs !== null ? { durationMs } : {}),
        ...(exitCode !== null ? { exitCode } : {}),
        id,
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

function normalizeArray(value, normalize) {
    if (!Array.isArray(value)) return []

    return value.map(normalize).filter((entry) => entry !== null)
}

/** Parse one canonical conversation record while discarding malformed optional entries. */
export function parseAgentConversation(content, referencePath) {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Malformed agent conversation: root must be an object')
    const id = requiredString(parsed.id, 'id')
    const status = requiredString(parsed.status, 'status')
    if (!AGENT_STATUSES.has(status)) throw new Error(`Malformed agent conversation: invalid status ${status}`)
    const startedAt = requiredString(parsed.startedAt, 'startedAt')
    const hasExplicitTitle = typeof parsed.title === 'string' && parsed.title.trim().length > 0
    const usage = normalizeAgentTokenUsage(parsed.usage)

    return {
        actionId: optionalString(parsed.actionId),
        cardInternalId: optionalString(parsed.cardInternalId),
        cardPath: optionalString(parsed.cardPath),
        completedAt: optionalString(parsed.completedAt),
        events: normalizeArray(parsed.events, normalizeEvent),
        hasExplicitTitle,
        id,
        messages: normalizeArray(parsed.messages, normalizeMessage),
        path: referencePath,
        providerSessions: normalizeArray(parsed.providerSessions, normalizeProviderSession),
        startedAt,
        status,
        title: hasExplicitTitle ? parsed.title : id,
        ...(usage ? { usage } : {}),
    }
}
