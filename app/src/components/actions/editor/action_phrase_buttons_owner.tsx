import { Paper, Slide, useMediaQuery } from '@mui/material'
import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import { currentActionPromptDraft, runPopupAction } from '../run/popup/action_popup_operations'
import type { ActionPopupRuntime } from '../run/popup/action_popup_types'
import { ActionPhraseButtons } from './action_phrase_buttons'
import { useActionRunSettings } from '../shared/use_action_run_settings'

interface ActionPhraseButtonsOwnerProps {
    action: ActionDefinition
    context: ActionContext
    runtime: ActionPopupRuntime
}

function selectActiveRunStatus(run: ActionRun | null) {
    if (run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput') return run.status

    return null
}

/** Owns follow-up visibility and phrase actions. */
export function ActionPhraseButtonsOwner(props: ActionPhraseButtonsOwnerProps) {
    const { action, context, runtime } = props
    const {bindingStore, conversationStore, historyStore, inputStore, resultStore, runValidationError, settingsStore} = runtime
    const pendingInsertionRef = useRef<Promise<void> | null>(null)
    const boundRunId = useBoundRunId(bindingStore)
    const activeRunStatus = useRunSelector(boundRunId, selectActiveRunStatus)
    const hasUnresolvedApprovals = useRunSelector(boundRunId, (run) => !!run?.approvals.length)
    const getPersistedWaitingSnapshot = useCallback(() => {
        const { loading, selectedConversation } = conversationStore.getSnapshot()

        return !loading && selectedConversation?.status === 'waitingForInput'
    }, [conversationStore])
    const persistedWaiting = useSyncExternalStore(conversationStore.subscribe, getPersistedWaitingSnapshot, getPersistedWaitingSnapshot)
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
    const settings = useActionRunSettings(action, settingsStore)
    const waitingForInput = activeRunStatus === 'waitingForInput'
        || (activeRunStatus === null && persistedWaiting)
    if (action.type !== 'agent' || action.phrases.length === 0) return null

    const handleSelect = async (text: string) => {
        const promptDraft = currentActionPromptDraft(action, context, bindingStore, conversationStore, false)
        const insertion = promptDraft.requestInsertion(text)
        pendingInsertionRef.current = insertion
        await insertion
        inputStore.setConvertMessage(null)
    }
    const handleDoubleClick = async () => {
        try {
            await pendingInsertionRef.current
        } catch {
            return
        }

        const promptDraft = currentActionPromptDraft(action, context, bindingStore, conversationStore, false)
        promptDraft.requestFlush()
        await runPopupAction({
            action,
            bindingStore,
            context,
            conversationStore,
            historyStore,
            inputStore,
            resultStore,
            runValidationError,
            settings,
            settingsStore,
        })
    }

    return (
        <Slide direction="up" in={waitingForInput && !hasUnresolvedApprovals} mountOnEnter timeout={reduceMotion ? 0 : undefined} unmountOnExit>
            <Paper
                elevation={4}
                sx={{
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                    flexShrink: 0,
                    mx: 1,
                    mb: 1,
                    p: 1,
                }}
            >
                <ActionPhraseButtons onDoubleClick={handleDoubleClick} onSelect={handleSelect} phrases={action.phrases} />
            </Paper>
        </Slide>
    )
}
