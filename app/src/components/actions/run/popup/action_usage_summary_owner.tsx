import { useSyncExternalStore } from 'react'
import { ActionUsageSummary } from './action_usage_summary'
import type { ActionUsageValuesService } from './action_usage_values_service'

interface ActionUsageSummaryOwnerProps {
    service: ActionUsageValuesService
}

/** Subscribes only footer leaf to stable depicted usage values. */
export function ActionUsageSummaryOwner({ service }: ActionUsageSummaryOwnerProps) {
    const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot)
    if (!snapshot) return null

    return <ActionUsageSummary onToggleScope={service.toggleScope} snapshot={snapshot} />
}
