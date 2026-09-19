import { useSyncExternalStore } from 'react'
import { activeScheduleService } from '../../services/actions/active_schedule_service'

export function useActiveSchedules() {
    return useSyncExternalStore(
        activeScheduleService.subscribe,
        activeScheduleService.getSnapshot,
        activeScheduleService.getSnapshot,
    )
}
