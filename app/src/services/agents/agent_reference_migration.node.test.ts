import { describe, expect, it } from 'vitest'
import type { Card } from '../../data/data_types'
import { planAgentReferenceMigration } from './agent_reference_migration'

function card(references: string[]): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '# Card',
        hasFrontmatter: true,
        header: {
            after: null,
            affects: [],
            agentLogReferences: references,
            author: null,
            id: 'F-1',
            internalId: 'card-1',
            owner: null,
            policy: {},
            references: [],
            status: 'ready',
            title: 'Card',
        },
        isActive: true,
        path: 'design/F-1-card.md',
    }
}

describe('planAgentReferenceMigration', () => {
    it('removes conversation fragments and deduplicates one activity path', () => {
        const activityPath = 'design/activity/card__card-1.json'
        const result = planAgentReferenceMigration([card([
            `${activityPath}#conversation=agent-1`,
            `${activityPath}#conversation=agent-2`,
            activityPath,
        ])])

        expect(result).toEqual({
            conflicts: [],
            plans: [{ cardPath: 'design/F-1-card.md', references: [activityPath] }],
        })
    })

    it('reports distinct activity paths without choosing one', () => {
        const result = planAgentReferenceMigration([card([
            'design/activity/card__card-1.json#conversation=agent-1',
            'design/activity/card__other.json#conversation=agent-2',
        ])])

        expect(result.plans).toEqual([])
        expect(result.conflicts).toEqual([expect.objectContaining({
            cardPath: 'design/F-1-card.md',
            message: expect.stringContaining('multiple activity files'),
        })])
    })

    it('reports malformed compound references without changing card references', () => {
        const result = planAgentReferenceMigration([card(['design/activity/card.json#conversation='])])

        expect(result.plans).toEqual([])
        expect(result.conflicts).toEqual([expect.objectContaining({ cardPath: 'design/F-1-card.md' })])
    })
})
