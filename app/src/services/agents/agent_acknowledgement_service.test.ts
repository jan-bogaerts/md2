import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentConversation } from '../../data/data_types'
import {
    agentAcknowledgementCheckpoint,
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

    it('notifies only subscribers for the acknowledged card', () => {
        const conversation = completedConversation('2026-01-01T00:01:00.000Z')
        const acknowledgedListener = vi.fn()
        const otherCardListener = vi.fn()
        const unsubscribeAcknowledged = agentAcknowledgementService.subscribeCard(
            'project',
            'design/F-1-root.md',
            acknowledgedListener,
        )
        const unsubscribeOther = agentAcknowledgementService.subscribeCard(
            'project',
            'design/F-2.md',
            otherCardListener,
        )

        agentAcknowledgementService.acknowledge('project', 'design/F-1-root.md', [conversation])

        expect(acknowledgedListener).toHaveBeenCalledOnce()
        expect(otherCardListener).not.toHaveBeenCalled()
        expect(agentAcknowledgementCheckpoint('project', 'design/F-1-root.md')).toBe(conversation.completedAt)
        unsubscribeAcknowledged()
        unsubscribeOther()
    })

    it('notifies the old and new card subscriptions when a checkpoint is renamed', () => {
        const conversation = completedConversation('2026-01-01T00:01:00.000Z')
        agentAcknowledgementService.acknowledge('project', 'design/F-1-root.md', [conversation])
        const oldPathListener = vi.fn()
        const newPathListener = vi.fn()
        const unsubscribeOld = agentAcknowledgementService.subscribeCard('project', 'design/F-1-root.md', oldPathListener)
        const unsubscribeNew = agentAcknowledgementService.subscribeCard('project', 'design/F-1-renamed.md', newPathListener)

        agentAcknowledgementService.renameCardPath('project', 'design/F-1-root.md', 'design/F-1-renamed.md')

        expect(oldPathListener).toHaveBeenCalledOnce()
        expect(newPathListener).toHaveBeenCalledOnce()
        expect(agentAcknowledgementCheckpoint('project', 'design/F-1-root.md')).toBeNull()
        expect(agentAcknowledgementCheckpoint('project', 'design/F-1-renamed.md')).toBe(conversation.completedAt)
        unsubscribeOld()
        unsubscribeNew()
    })
})
