import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Card, ProjectReference, ProjectSnapshot } from '../../data/data_types'
import type { DataService, DataServiceState } from '../../services/data/data_service'
import { useActiveCardCount } from './use_active_card_count'
import { useProjectReference } from './use_project_reference'

const project: ProjectReference = { branch: 'main', id: 'project' }

function card(path: string): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '# Card',
        header: {
            affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id: path, internalId: path,
            owner: null, policy: {}, references: [], status: 'todo', title: path,
        },
        hasFrontmatter: true,
        isActive: true,
        path,
    }
}

class TestDataService extends EventTarget {
    private state: DataServiceState

    constructor(snapshot: ProjectSnapshot) {
        super()
        this.state = { project, runningAgents: [], snapshot }
    }

    getState() {
        return this.state
    }

    publish(snapshot: ProjectSnapshot) {
        this.state = { ...this.state, snapshot }
        this.dispatchEvent(new Event('changed'))
    }
}

describe('project toolbar snapshots', () => {
    afterEach(cleanup)

    it('keeps project reference and active count stable for conversation and background-file updates', () => {
        const activeCard = card('design/F-1.md')
        const initialSnapshot = { activeCards: [activeCard], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' }
        const service = new TestDataService(initialSnapshot)
        let renderCount = 0
        const { result } = renderHook(() => {
            renderCount += 1

            return {
                activeCardCount: useActiveCardCount(service as unknown as DataService),
                project: useProjectReference(service as unknown as DataService),
            }
        })

        act(() => service.publish({
            ...initialSnapshot,
            activeCards: [{
                ...activeCard, agentConversations: [{
                    cardInternalId: activeCard.header.internalId,
                    cardPath: activeCard.path,
                    completedAt: '2026-01-01T00:01:00.000Z',
                    entries: [],
                    hasExplicitTitle: true,
                    id: 'conversation-1',
                    path: 'design/activity/card.json#conversation=conversation-1',
                    providerSessions: [],
                    startedAt: '2026-01-01T00:00:00.000Z',
                    status: 'completed',
                    title: 'Completed',
                    viewed: true,
                }],
            }],
            backgroundCards: [card('design/archive/F-2.md')],
            repositoryFiles: ['README.md'],
        }))

        expect(result.current).toEqual({ activeCardCount: 1, project })
        expect(renderCount).toBe(1)
    })

    it('updates active count when board membership changes', () => {
        const initialSnapshot = { activeCards: [card('design/F-1.md')], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' }
        const service = new TestDataService(initialSnapshot)
        const { result } = renderHook(() => useActiveCardCount(service as unknown as DataService))

        act(() => service.publish({ ...initialSnapshot, activeCards: [...initialSnapshot.activeCards, card('design/F-2.md')] }))

        expect(result.current).toBe(2)
    })
})
