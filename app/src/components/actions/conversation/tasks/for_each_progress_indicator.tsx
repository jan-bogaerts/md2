import { LinearProgress, Tooltip } from '@mui/material'
import { useCallback, useSyncExternalStore } from 'react'
import type { ActionRun } from '../../../../services/actions/action_run_registry'
import { useBoundRunId, useRunSelector } from '../../../hooks/use_action_runs'
import type { ActionRunBindingStore } from '../../run/state/action_run_binding_store'
import type { ActionConversationStore } from '../state/action_conversation_store'

interface ForEachProgressIndicatorProps {
    bindingStore: ActionRunBindingStore
    store: ActionConversationStore
}

const selectRunId = (run: ActionRun | null) => run?.runId ?? null
const selectLiveConversationId = (run: ActionRun | null) => run?.conversation?.id ?? null
const selectForEachProgress = (run: ActionRun | null) => run?.forEachProgress ?? null

/** Shows record-level progress for the live or historical conversation selected by one popup runtime. */
export function ForEachProgressIndicator({ bindingStore, store }: ForEachProgressIndicatorProps) {
    const boundRunId = useBoundRunId(bindingStore)
    const liveRunId = useRunSelector(boundRunId, selectRunId)
    const liveConversationId = useRunSelector(boundRunId, selectLiveConversationId)
    const liveProgress = useRunSelector(boundRunId, selectForEachProgress)
    const getSelectedConversationId = useCallback(
        () => store.getSnapshot().selectedConversation?.id ?? null,
        [store],
    )
    const getSelectedProgress = useCallback(
        () => store.getSnapshot().selectedConversation?.forEachProgress ?? null,
        [store],
    )
    const selectedConversationId = useSyncExternalStore(store.subscribe, getSelectedConversationId, getSelectedConversationId)
    const selectedProgress = useSyncExternalStore(store.subscribe, getSelectedProgress, getSelectedProgress)
    const browsingHistory = !!liveConversationId
        && !!selectedConversationId
        && selectedConversationId !== liveConversationId
    const progress = !liveRunId || browsingHistory ? selectedProgress : liveProgress
    if (!progress || progress.totalCount <= 0) return null

    const { processedCount, totalCount } = progress
    const value = processedCount / totalCount * 100
    const progressDescription = `${processedCount}/${totalCount} records processed`

    return (
        <Tooltip describeChild title={progressDescription}>
            <LinearProgress
                aria-label={`For-each progress: ${processedCount} of ${totalCount} processed`}
                sx={{
                    '& .MuiLinearProgress-bar': { bgcolor: 'primary.main' },
                    bgcolor: 'custom.track',
                    borderRadius: 1,
                    height: (theme) => theme.spacing(0.5),
                    width: '100%',
                }}
                value={value}
                variant="determinate"
            />
        </Tooltip>
    )
}
