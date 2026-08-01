import { afterEach, describe, expect, it } from 'vitest'
import type { AgentConversation } from '../../data/data_types'
import { agentAcknowledgementService, hasUnseenAgentResult } from './agent_acknowledgement_service'

function completedConversation(completedAt: string): AgentConversation {
    return {
        cardInternalId: 'root-card',
        cardPath: 'design/F-1-root.md',
        completedAt,
        entries: [],
        hasExplicitTitle: true,
        id: 'agent-1',
        path: 'design/activity/card__root-card.json#conversation=agent-1',
        providerSessions: [],
        startedAt: '2026-01-01T00:00:00.000Z',
        status: 'completed',
        title: 'Agent run',
    }
}

describe('AgentAcknowledgementService', () => {
    afterEach(() => {
        window.localStorage.clear()
    })

    it('keeps acknowledgements attached to a card after its file is renamed', () => {
        const conversations = [completedConversation('2026-01-01T00:01:00.000Z')]
        agentAcknowledgementService.acknowledge('project', 'design/F-1-root.md', conversations)
        expect(hasUnseenAgentResult('project', 'design/F-1-root.md', conversations)).toBe(false)

        agentAcknowledgementService.renameCardPath('project', 'design/F-1-root.md', 'design/F-1-renamed.md')

        expect(hasUnseenAgentResult('project', 'design/F-1-renamed.md', conversations)).toBe(false)
        expect(hasUnseenAgentResult('project', 'design/F-1-root.md', conversations)).toBe(true)
    })

    it('ignores renames for cards without an acknowledgement', () => {
        agentAcknowledgementService.renameCardPath('project', 'design/F-1-root.md', 'design/F-1-renamed.md')

        expect(window.localStorage.getItem('md2.agentAcknowledgements')).toBeNull()
    })
})
