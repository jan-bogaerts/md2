import type { AgentConversationEvent } from '../../../../data/data_types'

export type ClaudeAuthenticationRequiredEvent = AgentConversationEvent & {
    accountId: string
    agent: 'claude'
    errorKind: 'authenticationRequired'
}

export function isClaudeAuthenticationRequiredEvent(
    event: AgentConversationEvent,
): event is ClaudeAuthenticationRequiredEvent {
    return event.errorKind === 'authenticationRequired'
        && event.agent === 'claude'
        && typeof event.accountId === 'string'
        && event.accountId.length > 0
}
