import { register } from '../service_injector'

export interface MobileCardViewSnapshot {
    selectedColumnStatus: string | null
}

const INITIAL_SNAPSHOT: MobileCardViewSnapshot = { selectedColumnStatus: null }

/** Owns selected column for mobile board and hamburger navigation. */
export class MobileCardViewService extends EventTarget {
    private snapshot = INITIAL_SNAPSHOT

    getSnapshot(): MobileCardViewSnapshot {
        return this.snapshot
    }

    selectColumn(status: string) {
        this.update({ selectedColumnStatus: status })
    }

    selectVisibleColumn(visibleStatuses: string[]) {
        const { selectedColumnStatus } = this.snapshot
        const nextStatus = selectedColumnStatus !== null && visibleStatuses.includes(selectedColumnStatus)
            ? selectedColumnStatus
            : visibleStatuses[0] ?? null
        this.update({ selectedColumnStatus: nextStatus })
    }

    private update(snapshot: MobileCardViewSnapshot) {
        if (snapshot.selectedColumnStatus === this.snapshot.selectedColumnStatus) return

        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<MobileCardViewSnapshot>('changed', { detail: snapshot }))
    }
}

export const mobileCardViewService = register('mobileCardViewService', new MobileCardViewService())
