import { useEffect, useSyncExternalStore } from 'react'
import type { ActionHistoryStore } from './action_history_store'
import { ActionRunHistory } from './action_run_history'

interface ActionRunHistoryOwnerProps {
    store: ActionHistoryStore
}

/** Loads and renders history at history boundary. */
export function ActionRunHistoryOwner({ store }: ActionRunHistoryOwnerProps) {
    const { entries, error } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

    useEffect(() => {
        void store.load()
    }, [store])

    return <ActionRunHistory compact entries={entries} error={error} />
}
