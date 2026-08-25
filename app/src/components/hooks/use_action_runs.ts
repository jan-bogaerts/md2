import { useCallback, useSyncExternalStore } from 'react'
import { actionContextIdentity, type ActionContext } from '../../data/action_context'
import { actionRunRegistry, type ActionRun, type ActionRunStore } from '../../services/actions/action_run_registry'
import type { ActionRunBindingStore } from '../actions/run/state/action_run_binding_store'

const EMPTY_ACTIVE_RUNS: ReturnType<typeof actionRunRegistry.getGlobalActiveSnapshot> = []
const EMPTY_RUN_STORES: ActionRunStore[] = []
const subscribeEmpty = () => () => undefined
const getNullSnapshot = () => null

function useRunStore<T>(store: ActionRunStore | null, selector: (run: ActionRun | null) => T) {
    return useSyncExternalStore(
        store?.subscribe ?? subscribeEmpty,
        () => selector(store?.getSnapshot() ?? null),
        () => selector(null),
    )
}

function useActionRunStore(actionId: string, context: ActionContext) {
    const contextIdentity = actionContextIdentity(context)
    const subscribe = useCallback(
        (listener: () => void) => actionRunRegistry.subscribeActionRunByKey(actionId, contextIdentity, listener),
        [actionId, contextIdentity],
    )
    const getSnapshot = useCallback(
        () => actionRunRegistry.getActionRunStoreByKey(actionId, contextIdentity),
        [actionId, contextIdentity],
    )
    const store = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getNullSnapshot,
    )

    return store
}

/** Subscribe to only the latest run bound to one root action and context. */
export function useActionRun(actionId: string, context: ActionContext) {
    const store = useActionRunStore(actionId, context)

    return useRunStore(store, (run) => run)
}

/** Subscribe to one selected value from a scoped action run. */
export function useActionRunSelector<T>(actionId: string, context: ActionContext, selector: (run: ActionRun | null) => T) {
    const store = useActionRunStore(actionId, context)

    return useRunStore(store, selector)
}

/** Subscribe to one selected value from a run identified by runId. */
export function useRunSelector<T>(runId: string | null, selector: (run: ActionRun | null) => T) {
    const subscribe = useCallback(
        (listener: () => void) => runId ? actionRunRegistry.subscribeRun(runId, listener) : subscribeEmpty(),
        [runId],
    )
    const getSnapshot = useCallback(
        () => selector(runId ? actionRunRegistry.getRunStore(runId)?.getSnapshot() ?? null : null),
        [runId, selector],
    )

    return useSyncExternalStore(subscribe, getSnapshot, () => selector(null))
}

/** Subscribe to runId selected by one popup runtime. */
export function useBoundRunId(bindingStore: ActionRunBindingStore) {
    return useSyncExternalStore(bindingStore.subscribe, bindingStore.getSnapshot, bindingStore.getSnapshot)
}

/** Subscribe to all live run stores for one root action and context. */
export function useActionRunStores(actionId: string, context: ActionContext) {
    const contextIdentity = actionContextIdentity(context)
    const subscribe = useCallback(
        (listener: () => void) => actionRunRegistry.subscribeActionRunByKey(actionId, contextIdentity, listener),
        [actionId, contextIdentity],
    )
    const getSnapshot = useCallback(
        () => actionRunRegistry.getActionRunStoresByKey(actionId, contextIdentity),
        [actionId, contextIdentity],
    )

    return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_RUN_STORES)
}

/** Subscribe to active run status summaries for one context. */
export function useActiveActionRunsForContext(context: ActionContext) {
    const contextIdentity = actionContextIdentity(context)
    const subscribe = useCallback(
        (listener: () => void) => actionRunRegistry.subscribeContextActiveByKey(contextIdentity, listener),
        [contextIdentity],
    )
    const getSnapshot = useCallback(
        () => actionRunRegistry.getContextActiveSnapshotByKey(contextIdentity),
        [contextIdentity],
    )

    return useSyncExternalStore(
        subscribe,
        getSnapshot,
        () => EMPTY_ACTIVE_RUNS,
    )
}

export function useRunningActionForContext(context: ActionContext) {
    return useActiveActionRunsForContext(context)[0] ?? null
}

/** Subscribe to the global active-run aggregate used by the global indicator. */
export function useActiveActionRuns() {
    return useSyncExternalStore(
        actionRunRegistry.subscribeGlobalActive,
        actionRunRegistry.getGlobalActiveSnapshot,
        actionRunRegistry.getGlobalActiveSnapshot,
    )
}
