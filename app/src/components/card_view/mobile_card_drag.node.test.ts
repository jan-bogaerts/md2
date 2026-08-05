import type { DragMoveEvent } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'
import type { CardColumn } from '../../data/card_ordering'
import type { ProjectCard } from '../../data/data_types'
import { resolveMobileCardDragEvent } from './mobile_card_drag'

function card(path: string, status: string): ProjectCard {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], author: null, id: path, internalId: path, owner: null,
            policy: {}, status, title: path,
        },
        headerFields: {},
        isActive: true,
        path,
    }
}

const columns: CardColumn[] = [
    { cards: [card('a', 'todo'), card('b', 'todo')], status: 'todo' },
    { cards: [card('c', 'done')], status: 'done' },
]

function dragEvent(activeId: string, overId: string) {
    return { active: { id: activeId }, over: { id: overId } } as unknown as DragMoveEvent
}

describe('resolveMobileCardDragEvent', () => {
    it('allows reordering inside selected column', () => {
        expect(resolveMobileCardDragEvent(columns, 'todo', dragEvent('b', 'a')))
            .toEqual({ targetIndex: 0, targetStatus: 'todo' })
    })

    it('rejects drops into another column', () => {
        expect(resolveMobileCardDragEvent(columns, 'todo', dragEvent('a', 'c'))).toBeNull()
    })
})
