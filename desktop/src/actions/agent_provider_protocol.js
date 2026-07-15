const MISSING_SESSION_CODES = new Set([
    'conversation_not_found',
    'invalid_session_id',
    'resume_session_not_found',
    'session_not_found',
    'thread_not_found',
])

function eventCodes(event) {
    return [event.code, event.error?.code, event.error?.type, event.result?.code, event.subtype]
        .filter((value) => typeof value === 'string')
        .map((value) => value.toLowerCase())
}

function claudeAssistantText(event) {
    if (event.type !== 'assistant' || !Array.isArray(event.message?.content)) return ''

    return event.message.content
        .filter(({ type }) => type === 'text')
        .map(({ text }) => text)
        .filter((text) => typeof text === 'string')
        .join('')
}

function codexAssistantText(event) {
    if (event.type !== 'item.completed' || event.item?.type !== 'agent_message') return ''

    return typeof event.item.text === 'string' ? event.item.text : ''
}

function providerConversationId(agent, event) {
    if (agent === 'codex' && event.type === 'thread.started') return event.thread_id ?? event.thread?.thread_id ?? null
    if (agent === 'claude' && typeof event.session_id === 'string') return event.session_id

    return null
}

function isTurnActivity(agent, event) {
    if (agent === 'codex') return event.type === 'turn.started' || event.type === 'item.started' || event.type === 'item.completed'
    if (agent === 'claude') return event.type === 'assistant' || event.type === 'user'

    return false
}

function isMissingSession(agent, event, turnStarted) {
    if (turnStarted) return false
    if (agent !== 'codex' && agent !== 'claude') return false
    const isFailureEvent = event.type === 'error' || (agent === 'claude' && event.type === 'result' && event.is_error === true)

    return isFailureEvent && eventCodes(event).some((code) => MISSING_SESSION_CODES.has(code))
}

function normalizedEventType(agent, event) {
    if (agent === 'codex') return event.type
    if (agent === 'claude' && event.type === 'system') return `system.${event.subtype ?? 'event'}`

    return event.type
}

class AgentProviderProtocolParser {
    constructor(agent, onEvent, onMalformed) {
        this.agent = agent
        this.buffer = ''
        this.onEvent = onEvent
        this.onMalformed = onMalformed
        this.turnStarted = false
    }

    push(chunk) {
        this.buffer += chunk.toString()
        const lines = this.buffer.split(/\r?\n/u)
        this.buffer = lines.pop() ?? ''
        for (const line of lines) this.parseLine(line)
    }

    finish() {
        if (this.buffer.length > 0) this.parseLine(this.buffer)
        this.buffer = ''
    }

    parseLine(line) {
        if (line.trim().length === 0) return

        let event
        try {
            event = JSON.parse(line)
        } catch {
            this.onMalformed(line)
            return
        }
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
            this.onMalformed(line)
            return
        }

        const missingSession = isMissingSession(this.agent, event, this.turnStarted)
        this.turnStarted = this.turnStarted || isTurnActivity(this.agent, event)
        const assistantText = this.agent === 'codex' ? codexAssistantText(event) : claudeAssistantText(event)
        this.onEvent({
            assistantText,
            conversationId: providerConversationId(this.agent, event),
            event,
            missingSession,
            turnStarted: this.turnStarted,
            type: normalizedEventType(this.agent, event),
        })
    }
}

function createAgentProviderProtocolParser(agent, onEvent, onMalformed) {
    if (agent !== 'codex' && agent !== 'claude') return null

    return new AgentProviderProtocolParser(agent, onEvent, onMalformed)
}

module.exports = { createAgentProviderProtocolParser }
