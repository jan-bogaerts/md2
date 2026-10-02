import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import { dataService } from '../data/data_service'
import { dialogService } from '../dialog_service'

/** Owns activity loaded for an open historical card popup. */
export class HistoricalCardActivityService extends EventTarget {
    private readonly snapshots = new Map<string, CardActivityFile[] | null>()

    getSnapshot(key: string) {
        return this.snapshots.get(key) ?? null
    }

    subscribe(key: string, listener: () => void) {
        this.addEventListener(key, listener)
        return () => this.removeEventListener(key, listener)
    }

    async load(key: string, cardInternalId: string, signal: AbortSignal) {
        this.snapshots.set(key, null)
        this.dispatchEvent(new Event(key))
        try {
            const activities = await dataService.loadReferencedCardActivities(cardInternalId)
            if (signal.aborted) return
            this.snapshots.set(key, activities)
            this.dispatchEvent(new Event(key))
        } catch (error) {
            if (!signal.aborted) dialogService.error(error, { fallbackMessage: 'Could not load card activity' })
        }
    }
}

export const historicalCardActivityService = new HistoricalCardActivityService()
