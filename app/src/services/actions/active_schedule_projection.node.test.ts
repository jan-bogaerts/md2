import { describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../../data/action_types'
import type { AnySchedule } from '../../data/action_schedule_types'
import type { Card } from '../../data/data_types'
import { projectActiveSchedules } from './active_schedule_projection'

const action = { id: 'implement', label: 'Implement' } as ActionDefinition
const card = {
    header: { id: 'F-1', internalId: 'card-1', title: 'First card' },
    path: 'design/F-1.md',
} as Card

function actionSchedule(): AnySchedule {
    return {
        actionId: 'implement',
        context: { cardInternalId: 'card-1', file: 'old/F-1.md', kind: 'card' },
        createdAt: '2026-09-18T10:00:00.000Z',
        id: 'schedule-1',
        kind: 'action',
        status: 'pending',
        trigger: { cardInternalId: 'missing-trigger', registrationState: 'todo', targetState: 'ready', type: 'card-state' },
    }
}

function sequenceSchedule(): AnySchedule {
    return {
        actionCompleted: true,
        actionId: 'missing-action',
        cardInternalIds: ['card-1', 'missing-card'],
        createdAt: '2026-09-18T10:00:00.000Z',
        currentIndex: 1,
        currentRunId: null,
        failure: null,
        id: 'sequence-1',
        kind: 'sequence',
        readyState: 'ready',
        readyStateMet: false,
        status: 'running',
        trigger: { agent: 'claude', expectedResetAt: '2026-09-19T10:00:00.000Z', limitId: 'default', type: 'account-reset', windowId: 'weekly' },
    }
}

describe('projectActiveSchedules', () => {
    it('resolves a current card path by internal ID instead of persisted context path', () => {
        const sources = { actions: [action], cards: [card], claudeSnapshot: null, codexSnapshot: null }
        const [item] = projectActiveSchedules([actionSchedule()], sources)

        expect(item.target).toEqual({ available: true, id: 'card-1', label: 'F-1 — First card', path: 'design/F-1.md' })
        expect(item.triggerCard).toEqual({ available: false, id: 'missing-trigger', label: 'missing-trigger', path: null })
        expect(item.unavailableReasons).toEqual(['Trigger card unavailable: missing-trigger'])
    })

    it('projects exact sequence progress target and retains missing identities', () => {
        const [item] = projectActiveSchedules([sequenceSchedule()], {
            actions: [action],
            cards: [card],
            claudeSnapshot: { available: true, observedAt: 1, windows: [{ id: 'weekly', resetsAt: 2, usedPercent: 10 }] },
            codexSnapshot: null,
        })

        expect(item.actionLabel).toBe('missing-action')
        expect(item.target).toEqual({ available: false, id: 'missing-card', label: 'missing-card', path: null })
        expect(item.tracker).toEqual({ available: true, label: 'Claude / default / weekly' })
        expect(item.unavailableReasons).toEqual([
            'Action unavailable: missing-action',
            'Target card unavailable: missing-card',
        ])
    })
})
