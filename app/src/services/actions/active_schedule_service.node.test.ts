import { describe, expect, it, vi } from 'vitest'
import type { ActionService } from './action_service'
import type { AnySchedule } from '../../data/action_schedule_types'
import type { DataService } from '../data/data_service'
import type { Card, ProjectSnapshot } from '../../data/data_types'
import type { ClaudeRateLimitService } from '../agents/claude_rate_limit_service'
import type { CodexRateLimitService } from '../agents/codex_rate_limit_service'
import { ActiveScheduleService } from './active_schedule_service'

function schedule(): AnySchedule {
    return {
        actionId: 'implement',
        context: { cardInternalId: 'card-1', kind: 'card' },
        createdAt: '2026-09-18T10:00:00.000Z',
        id: 'schedule-1',
        kind: 'action',
        status: 'pending',
        trigger: { timestamp: '2026-09-19T10:00:00.000Z', type: 'at' },
    }
}

function createHarness() {
    const actionEvents = new EventTarget()
    const dataEvents = new EventTarget()
    const claudeEvents = new EventTarget()
    const codexEvents = new EventTarget()
    const bridge = {
        deleteSchedule: vi.fn(async () => []),
        listActiveSchedules: vi.fn(async () => [schedule()]),
    }
    const project = { branch: 'main', id: 'project', rootPath: 'C:/project' }
    let cards = [{ header: { id: 'F-1', internalId: 'card-1', title: 'First' }, path: 'design/F-1.md' } as Card]
    const rateLimitState = { receivedAt: null, snapshot: null, stale: false }
    const actionService = Object.assign(actionEvents, { getActions: () => [] }) as unknown as ActionService
    const claudeRateLimits = Object.assign(claudeEvents, { getState: () => rateLimitState }) as unknown as ClaudeRateLimitService
    const codexRateLimits = Object.assign(codexEvents, { getState: () => rateLimitState }) as unknown as CodexRateLimitService
    const serviceData = Object.assign(
        dataEvents,
        {
            getState: () => ({
                project,
                runningAgents: [],
                snapshot: { activeCards: cards, backgroundCards: [] } as unknown as ProjectSnapshot,
            }),
        },
    ) as unknown as DataService
    const service = new ActiveScheduleService({
        actionService,
        claudeRateLimitService: claudeRateLimits,
        codexRateLimitService: codexRateLimits,
        dataService: serviceData,
        getActionsFolder: () => 'design/actions',
        getBridge: () => bridge as never,
        getProject: () => project,
    })

    return { bridge, dataEvents, service, setCards: (nextCards: Card[]) => { cards = nextCards } }
}

describe('ActiveScheduleService', () => {
    it('loads backend-filtered schedules when project becomes active', async () => {
        const { bridge, service } = createHarness()
        service.start()

        await vi.waitFor(() => expect(service.getSnapshot().loading).toBe(false))

        expect(bridge.listActiveSchedules).toHaveBeenCalledOnce()
        expect(service.getSnapshot().items.map(({ schedule: item }) => item.id)).toEqual(['schedule-1'])
        service.stop()
    })

    it('reloads through backend API when schedule file changes', async () => {
        const { bridge, dataEvents, service } = createHarness()
        service.start()
        await vi.waitFor(() => expect(bridge.listActiveSchedules).toHaveBeenCalledOnce())

        dataEvents.dispatchEvent(new CustomEvent('repositoryChanged', {detail: { changeKind: 'changed', path: 'design/actions/.md2-schedules.json' }}))
        await vi.waitFor(() => expect(bridge.listActiveSchedules).toHaveBeenCalledTimes(2))

        service.stop()
    })

    it('asks backend to delete once and reloads canonical active list', async () => {
        const { bridge, service } = createHarness()
        service.start()
        await vi.waitFor(() => expect(service.getSnapshot().items).toHaveLength(1))

        const firstDelete = service.deleteSchedule('schedule-1')
        const repeatedDelete = service.deleteSchedule('schedule-1')
        await Promise.all([firstDelete, repeatedDelete])

        expect(bridge.deleteSchedule).toHaveBeenCalledOnce()
        expect(bridge.listActiveSchedules).toHaveBeenCalledTimes(2)
        expect(service.getSnapshot().deletingScheduleIds).toEqual([])
        service.stop()
    })

    it('reprojects current card path after same-project card data changes', async () => {
        const { dataEvents, service, setCards } = createHarness()
        service.start()
        await vi.waitFor(() => expect(service.getSnapshot().items).toHaveLength(1))

        setCards([{ header: { id: 'F-1', internalId: 'card-1', title: 'Renamed' }, path: 'design/F-1-renamed.md' } as Card])
        dataEvents.dispatchEvent(new Event('changed'))

        expect(service.getSnapshot().items[0].target?.path).toBe('design/F-1-renamed.md')
        service.stop()
    })
})
