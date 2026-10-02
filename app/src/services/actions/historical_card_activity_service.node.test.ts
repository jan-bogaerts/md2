import { afterEach, describe, expect, it, vi } from 'vitest'
import { createActivityFile } from '../../../../shared/card_activity.mjs'
import { dataService } from '../data/data_service'
import { dialogService } from '../dialog_service'
import { HistoricalCardActivityService } from './historical_card_activity_service'

describe('HistoricalCardActivityService', () => {
    afterEach(() => vi.restoreAllMocks())

    it('publishes activity for one card key after loading', async () => {
        const activity = createActivityFile({ cardInternalId: 'card-1', kind: 'card' })
        vi.spyOn(dataService, 'loadReferencedCardActivities').mockResolvedValue([activity])
        const service = new HistoricalCardActivityService()
        const listener = vi.fn()
        const unsubscribe = service.subscribe('card-1', listener)

        await service.load('card-1', 'card-1', new AbortController().signal)

        expect(service.getSnapshot('card-1')).toEqual([activity])
        expect(service.getSnapshot('card-2')).toBeNull()
        expect(listener).toHaveBeenCalledTimes(2)
        unsubscribe()
    })

    it('reports failed activity loading and leaves no false empty snapshot', async () => {
        vi.spyOn(dataService, 'loadReferencedCardActivities').mockRejectedValue(new Error('Activity file missing'))
        const report = vi.spyOn(dialogService, 'error')
        const service = new HistoricalCardActivityService()

        await service.load('card-1', 'card-1', new AbortController().signal)

        expect(service.getSnapshot('card-1')).toBeNull()
        expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'Activity file missing' }), {fallbackMessage: 'Could not load card activity'})
    })
})
