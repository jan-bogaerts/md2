import { useEffect, useSyncExternalStore } from 'react'
import { mobileCardViewService } from '../../services/project/mobile_card_view_service'
import type { VisibleCardColumn } from './use_card_view_columns'

function subscribe(listener: () => void) {
    mobileCardViewService.addEventListener('changed', listener)

    return () => mobileCardViewService.removeEventListener('changed', listener)
}

function getSnapshot() {
    return mobileCardViewService.getSnapshot().selectedColumnStatus
}

/** Returns selected visible mobile column and repairs missing or hidden selections. */
export function useMobileCardViewColumn(columns: VisibleCardColumn[]) {
    const selectedStatus = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const selectedColumn = columns.find(({ status }) => status === selectedStatus) ?? columns[0] ?? null

    useEffect(() => {
        mobileCardViewService.selectVisibleColumn(columns.map(({ status }) => status))
    }, [columns])

    return selectedColumn
}
