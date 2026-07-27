const AGENT_MESSAGE_ROLES = new Set(['assistant', 'user'])
const AGENT_STATUSES = new Set(['cancelled', 'completed', 'failed', 'running', 'waitingForInput'])

function requiredString(value, fieldName) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Malformed agent conversation: missing ${fieldName}`)

    return value
}

function optionalString(value) {
    return typeof value === 'string' && value.length > 0 ? value : null
}

function usageNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function normalizeUsage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

    const usage = {
        cachedInputTokens: usageNumber(value.cachedInputTokens),
        inputTokens: usageNumber(value.inputTokens),
        outputTokens: usageNumber(value.outputTokens),
        reasoningTokens: usageNumber(value.reasoningTokens),
    }
    usage.totalTokens = usage.inputTokens + usage.cachedInputTokens + usage.outputTokens + usage.reasoningTokens
    if (typeof value.costUsd === 'number' && Number.isFinite(value.costUsd) && value.costUsd >= 0) usage.costUsd = value.costUsd

    return usage
}

function normalizeMessage(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    if (!AGENT_MESSAGE_ROLES.has(value.role)) return null
    if (typeof value.content !== 'string') return null
    const id = optionalString(value.id)
    const timestamp = optionalString(value.timestamp)
    if (!id || !timestamp) return null
    const agent = optionalString(value.agent)

    return { ...(agent ? { agent } : {}), content: value.content, id, role: value.role, timestamp }
}

function normalizeEvent(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    if (typeof value.content !== 'string') return null
    const id = optionalString(value.id)
    const timestamp = optionalString(value.timestamp)
    const type = optionalString(value.type)
    if (!id || !timestamp || !type) return null

    return { content: value.content, id, timestamp, type }
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
    const usage = normalizeUsage(parsed.usage)

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
