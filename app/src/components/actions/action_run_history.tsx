import type { ActionRunHistoryEntry } from '../../data/electron_action_bridge'

export interface ActionRunHistoryProps {
    entries: ActionRunHistoryEntry[]
}

export function ActionRunHistory(props: ActionRunHistoryProps) {
    void props

    return null
}
