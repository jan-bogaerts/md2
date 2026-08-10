import { describe, expect, it } from 'vitest'
import type { Card, StorageService } from '../../data/data_types'
import { repairProjectActivities } from './activity_repair'

function markdownDocument(path: string, references: string[]): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '# Notes',
        hasFrontmatter: false,
        header: {
            affects: [],
            after: null,
            agentLogReferences: references,
            author: null,
            id: 'F-0',
            internalId: null,
            owner: null,
            policy: {},
            status: null,
            title: 'Notes',
        },
        isActive: false,
        path,
    }
}

describe('repairProjectActivities', () => {
    it('preserves references on regular markdown documents without an internal ID', async () => {
        const reference = 'design/activity/card__notes.json#conversation=agent-1'
        const document = markdownDocument('design/architecture/notes.md', [reference])
        const storage = {} as StorageService

        const repair = await repairProjectActivities(
            [document],
            { branch: 'main', id: 'project' },
            'design',
            [],
            storage,
        )

        expect(repair.referencesByCardPath.get(document.path)).toEqual([reference])
    })
})
