import { Paper, Slide, useMediaQuery } from '@mui/material'
import { useRef, useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import type { ActionRunSettingsStore } from '../../../services/actions/action_run_settings_service'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import type { ActionConversationStore } from '../conversation/action_conversation_store'
import type { ActionHistoryStore } from '../run/state/action_history_store'
import { currentActionPromptDraft, runPopupAction } from '../run/popup/action_popup_operations'
import { ActionPhraseButtons } from './action_phrase_buttons'
import type { ActionRunInputStore } from '../run/state/action_run_input_store'
import type { ActionRunResultStore } from '../run/state/action_run_result_store'
import { useActionRunSettings } from '../shared/use_action_run_settings'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

interface ActionPhraseButtonsOwnerProps {
    action: ActionDefinition
    bindingStore: ActionRunBindingStore
    context: ActionContext
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    runValidationError: string | null
    settingsStore: ActionRunSettingsStore
}

function selectActiveRunStatus(run: ActionRun | null) {
    if (run?.status === 'queued' || run?.status === 'running' || run?.status === 'waitingForInput') return run.status

    return null
}

/** Owns follow-up visibility and phrase actions. */
export function ActionPhraseButtonsOwner(props: ActionPhraseButtonsOwnerProps) {
    const {
        action, bindingStore, context, conversationStore, historyStore, inputStore, resultStore,
        runValidationError, settingsStore,
    } = props
    const pendingInsertionRef = useRef<Promise<void> | null>(null)
    const boundRunId = useBoundRunId(bindingStore)
    const activeRunStatus = useRunSelector(boundRunId, selectActiveRunStatus)
    const hasUnresolvedApprovals = useRunSelector(boundRunId, (run) => !!run?.approvals.length)
    const conversationSnapshot = useSyncExternalStore(
        conversationStore.subscribe,
        conversationStore.getSnapshot,
        conversationStore.getSnapshot,
    )
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
    const settings = useActionRunSettings(action, settingsStore)
    const waitingForInput = activeRunStatus === 'waitingForInput'
        || (activeRunStatus === null
            && !conversationSnapshot.loading
            && conversationSnapshot.selectedConversation?.status === 'waitingForInput')
    if (action.type !== 'agent' || action.phrases.length === 0) return null

    const handleSelect = async (text: string) => {
        const promptDraft = currentActionPromptDraft(action, context, bindingStore, false)
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

        const promptDraft = currentActionPromptDraft(action, context, bindingStore, false)
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
