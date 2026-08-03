import { afterEach, describe, expect, it } from 'vitest'
import type { AgentConversation } from '../../data/data_types'
import {
    agentAcknowledgementService,
    hasUnseenAgentResult,
    latestUnseenAgentResult,
} from './agent_acknowledgement_service'

function completedConversation(completedAt: string, actionId = 'implement', id = 'agent-1'): AgentConversation {
    return {
        actionId,
        cardInternalId: 'root-card',
        cardPath: 'design/F-1-root.md',
        completedAt,
        entries: [],
        hasExplicitTitle: true,
        id,
        path: `design/activity/card__root-card.json#conversation=${id}`,
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

    it('returns newest unseen completed result for requested action', () => {
        const older = completedConversation('2026-01-01T00:01:00.000Z', 'implement', 'older')
        const newest = completedConversation('2026-01-01T00:03:00.000Z', 'implement', 'newest')
        const otherAction = completedConversation('2026-01-01T00:04:00.000Z', 'review', 'review')

        expect(latestUnseenAgentResult('project', 'design/F-1-root.md', [newest, otherAction, older], 'implement')).toBe(newest)
    })

    it('uses card checkpoint so acknowledging newest result also views older results', () => {
        const older = completedConversation('2026-01-01T00:01:00.000Z', 'implement', 'older')
        const newest = completedConversation('2026-01-01T00:03:00.000Z', 'implement', 'newest')
        agentAcknowledgementService.acknowledge('project', 'design/F-1-root.md', [newest])

        expect(latestUnseenAgentResult('project', 'design/F-1-root.md', [newest, older], 'implement')).toBeNull()
        expect(hasUnseenAgentResult('project', 'design/F-1-root.md', [newest, older])).toBe(false)
    })
})
