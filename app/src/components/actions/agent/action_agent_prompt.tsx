import { Box, Typography } from '@mui/material'
import {
    useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore,
    type KeyboardEvent,
} from 'react'
import type { ActionContext } from '../../../data/action_context'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../../data/action_placeholders'
import type { ActionDefinition } from '../../../data/action_types'
import type { AgentQuestion } from '../../../data/data_types'
import type { ActionRun } from '../../../services/actions/action_run_registry'
import { dialogService } from '../../../services/dialog_service'
import { remoteConnectionService } from '../../../services/data/remote_connection_service'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import { MarkdownEditor, type MarkdownEditorHandle } from '../../editor/markdown_editor'
import { pendingConversationQuestions } from '../conversation/state/action_conversation_chat_selectors'
import { ActionPhraseButtonsOwner } from '../editor/action_phrase_buttons_owner'
import { defaultPreparePrompt } from '../run/popup/action_popup_defaults'
import { ActionPopupBottomRow } from '../run/popup/action_popup_bottom_row'
import {
    answerRestoredConversationQuestions,
    currentActionPromptDraft,
    currentActionRun,
    dismissRestoredConversationQuestions,
    runPopupAction,
} from '../run/popup/action_popup_operations'
import { actionPopupRunDisabled } from '../run/popup/action_popup_run_disabled'
import type { ActionPopupRuntime } from '../run/popup/action_popup_types'
import { ActionScheduleOwner } from '../run/schedule/action_schedule_owner'
import { useActionRunSettings } from '../shared/use_action_run_settings'
import { ActionAgentQuestionOwner, type RestoredAgentQuestions } from './action_agent_question_owner'

const EMPTY_PROMPT_EDITOR_HEIGHT = 56;

interface ActionAgentPromptProps {
    action: ActionDefinition
    assignmentContext: ActionContext
    questionsEnabled: boolean
    runtime: ActionPopupRuntime
    /** Base context used for scheduling, independent of the selected worktree assignment. */
    scheduleContext: ActionContext
}

function selectRunStatus(run: ActionRun | null) {
    return run?.status ?? 'idle'
}

function selectActiveActionType(run: ActionRun | null) {
    return run?.activeActionType ?? null
}

function selectLiveConversationId(run: ActionRun | null) {
    return run?.conversation?.id ?? null
}

function selectQuestion(run: ActionRun | null) {
    return run?.question ?? null
}

function getRemoteConnectionStatus() {
    return remoteConnectionService.getSnapshot().status
}

/** Prompt editor, questions, phrases, scheduling, and run controls for one popup runtime. */
export function ActionAgentPrompt(props: ActionAgentPromptProps) {
    const { action, assignmentContext: context, questionsEnabled, runtime, scheduleContext } = props
    const {
        agentLayoutStore, bindingStore, commandLayoutStore, conversationStore, historyStore, inputStore, resultStore,
        runValidationError, scheduleStore, settingsStore,
    } = runtime
    // Agent layouts host questions; command input layouts never do.
    const layoutStore = questionsEnabled ? agentLayoutStore : commandLayoutStore
    const commandAction = action.type === 'command'
    const promptEditorRef = useRef<MarkdownEditorHandle>(null)
    const boundRunId = useBoundRunId(bindingStore)
    const runStatus = useRunSelector(boundRunId, selectRunStatus)
    const activeActionType = useRunSelector(boundRunId, selectActiveActionType)
    const liveConversationId = useRunSelector(boundRunId, selectLiveConversationId)
    const question = useRunSelector(boundRunId, selectQuestion)
    const getSelectedConversation = useCallback(() => conversationStore.getSnapshot().selectedConversation, [conversationStore])
    const selectedConversation = useSyncExternalStore(conversationStore.subscribe, getSelectedConversation, getSelectedConversation)
    const getConversationLoading = useCallback(() => conversationStore.getSnapshot().loading, [conversationStore])
    const conversationLoading = useSyncExternalStore(conversationStore.subscribe, getConversationLoading, getConversationLoading)
    const getConvertMessage = useCallback(() => inputStore.getSnapshot().convertMessage, [inputStore])
    const convertMessage = useSyncExternalStore(inputStore.subscribe, getConvertMessage, getConvertMessage)
    const remoteStatus = useSyncExternalStore(
        remoteConnectionService.subscribe,
        getRemoteConnectionStatus,
        getRemoteConnectionStatus,
    )
    const layout = useSyncExternalStore(layoutStore.subscribe, layoutStore.getSnapshot, layoutStore.getSnapshot);
    const settings = useActionRunSettings(action, settingsStore)
    const sessionActive = runStatus === 'queued' || runStatus === 'running' || runStatus === 'waitingForInput'
    const displayedConversationId = selectedConversation?.id ?? liveConversationId
    const restoredQuestionList = sessionActive ? null : pendingConversationQuestions(selectedConversation)
    const operationInput = {
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
    }
    const newConversationDraft = action.type === 'agent'
        && boundRunId === null
        && !sessionActive
        && runStatus !== 'completed'
        && selectedConversation === null
    const prepare = newConversationDraft && !conversationLoading
    const commandInitialValue = sessionActive && activeActionType === 'agent' ? '' : undefined
    const promptDraft = currentActionPromptDraft(
        action, context, bindingStore, conversationStore, newConversationDraft, commandInitialValue,
    )
    const promptEmpty = useSyncExternalStore(promptDraft.subscribe, promptDraft.getEmptySnapshot, promptDraft.getEmptySnapshot);
    const getPreparationStatus = useCallback(() => promptDraft.getEditorSnapshot().preparationStatus, [promptDraft])
    const preparationStatus = useSyncExternalStore(promptDraft.subscribeEditor, getPreparationStatus, getPreparationStatus)

    const hasQuestions = questionsEnabled && !!(question || restoredQuestionList)
    const questionIdentity = questionsEnabled
        ? question?.requestId ?? restoredQuestionList ?? null
        : null
    useLayoutEffect(() => {
        layoutStore.setInput(promptEmpty, questionIdentity);
    }, [layoutStore, promptEmpty, questionIdentity]);

    useEffect(() => {
        if (!prepare || promptDraft.hasLocalEdits()) return
        if (remoteStatus === 'connecting' || remoteStatus === 'reconnecting') return

        void promptDraft.prepare(() => defaultPreparePrompt(action, context)).catch((error: unknown) => {
            dialogService.error(error, { fallbackMessage: 'Could not prepare action prompt' })
        })
    }, [action, context, prepare, promptDraft, remoteStatus])

    const handleAttachments = useCallback(async (files: File[], insertMarkdown: (markdown: string) => void) => {
        const attachmentWorkflow = await import('../../../services/attachments/attachment_workflow')
        if (context.file) {
            await attachmentWorkflow.attachFilesToCardMarkdown(context.file, files, insertMarkdown)
            return
        }

        await attachmentWorkflow.attachFilesToOriginalMarkdown(files, insertMarkdown)
    }, [context])
    const attachmentHandler = action.type === 'agent' ? handleAttachments : undefined

    const handleRestoredAnswer = async (questions: AgentQuestion[], answers: Record<string, string[]>) => {
        try {
            await answerRestoredConversationQuestions(operationInput, questions, answers)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not answer the agent question' })
        }
    }
    const handleRestoredDismiss = async () => {
        try {
            await dismissRestoredConversationQuestions(operationInput)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not dismiss the agent questions' })
        }
    }
    const restoredQuestions: RestoredAgentQuestions | null = restoredQuestionList
        ? { onAnswer: handleRestoredAnswer, onDismiss: handleRestoredDismiss, questions: restoredQuestionList }
        : null

    const handlePromptBlock = useCallback((surface: HTMLElement | null) => {
        layoutStore.attachPromptBlock(surface);
    }, [layoutStore]);
    const handleQuestionsSurface = useCallback((surface: HTMLElement | null) => {
        layoutStore.attachQuestions(surface);
    }, [layoutStore]);
    const handleLiveChange = layoutStore.activatePrompt;
    const handleQuestionsActivate = () => layoutStore.activateQuestions();

    const handleRunShortcut = () => {
        const run = currentActionRun(bindingStore)
        const runState = {
            agentActive: sessionActive && activeActionType === 'agent',
            interactionReady: !!run?.interactionReady,
            runDisabledMessage: settings.runDisabledMessage,
            runStatus,
        }
        if (actionPopupRunDisabled(
            action,
            runState,
            promptDraft.getSnapshot(),
            promptDraft.getEditorSnapshot().preparationStatus,
        )) return

        void runPopupAction(operationInput)
    }
    const handlePromptKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return

        event.preventDefault()
        event.stopPropagation()
        promptEditorRef.current?.flush()
        handleRunShortcut()
    }

    const activeBlockHeight = hasQuestions ? layout.blockHeight : null;
    // Automatic question layout: questions take their content height up to the cap, the prompt fills the rest.
    const automaticQuestions = hasQuestions && activeBlockHeight === null
    const editorFills = !promptEmpty || automaticQuestions
    const primaryRegion = layout.primaryRegion;

    return (
        <>
            <ActionScheduleOwner
                accountId={settings.accountId}
                action={action}
                conversationId={displayedConversationId}
                context={scheduleContext}
                promptDraft={promptDraft}
                selectionValidationError={settings.selectionValidationError}
                store={scheduleStore}
            />
            <Box
                data-testid="action-prompt-block"
                ref={handlePromptBlock}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0,
                    gap: 1,
                    height: activeBlockHeight ?? (automaticQuestions ? layout.value : 'auto'),
                    maxHeight: layout.maximum,
                    overflowY: 'auto',
                    minHeight: 0,
                }}
            >
                <Box
                    aria-label="Prompt"
                    onKeyDownCapture={handlePromptKeyDownCapture}
                    sx={{
                        borderRadius: '9px',
                        border: 1,
                        borderColor: 'custom.borderStrong',
                        display: 'flex',
                        flexDirection: 'column',
                        flex: hasQuestions && !automaticQuestions ? '0 0 auto' : 1,
                        height: automaticQuestions || (promptEmpty && activeBlockHeight === null) ? 'auto' : layout.promptHeight,
                        minHeight: hasQuestions ? layout.promptMinHeight : undefined,
                        overflow: 'hidden',
                        '&:focus-within': {
                            borderColor: 'primary.main',
                            boxShadow: (theme) => `0 0 0 3px ${theme.palette.action.selected}`,
                        },
                    }}
                >
                    <Box
                        data-testid="action-prompt-editor-region"
                        sx={{
                            flex: editorFills ? 1 : '0 0 auto',
                            height: editorFills ? undefined : EMPTY_PROMPT_EDITOR_HEIGHT,
                            mb: editorFills ? 1 : -1.5,
                            minHeight: 0,
                            overflowY: 'auto',
                            px: 1,
                        }}
                    >
                        <MarkdownEditor
                            attachmentHandler={attachmentHandler}
                            draft={promptDraft.editorDraft}
                            flushOnBlur
                            hideAttachmentControl
                            hideToolbar
                            localTextSearch={false}
                            monospace={commandAction}
                            onLiveChange={handleLiveChange}
                            placeholders={ACTION_PROMPT_PLACEHOLDERS}
                            plainText={commandAction}
                            readOnly={preparationStatus !== 'ready'}
                            ref={promptEditorRef}
                        />
                    </Box>
                    {action.type === 'agent' ? <ActionPhraseButtonsOwner action={action} context={context} runtime={runtime} /> : null}
                    <ActionPopupBottomRow action={action} assignmentContext={context} embedded runtime={runtime} />
                </Box>
                {hasQuestions ? (
                    <Box
                        data-testid="action-questions-region"
                        onFocusCapture={handleQuestionsActivate}
                        onPointerDown={handleQuestionsActivate}
                        ref={handleQuestionsSurface}
                        sx={{
                            flex: automaticQuestions
                                ? '0 1 auto'
                                : primaryRegion === 'questions' ? 1 : '0 0 auto',
                            height: !automaticQuestions && primaryRegion === 'prompt'
                                ? layout.questionsMinHeight
                                : undefined,
                            maxHeight: automaticQuestions ? layout.questionsMaxHeight : 'fit-content',
                            minHeight: automaticQuestions ? 0 : layout.questionsMinHeight,
                            overflowY: 'auto',
                        }}
                    >
                        <ActionAgentQuestionOwner bindingStore={bindingStore} restored={restoredQuestions} />
                    </Box>
                ) : null}
            </Box>
            {convertMessage ? (
                <Typography color="text.secondary" role="status" variant="caption">
                    {convertMessage}
                </Typography>
            ) : null}
        </>
    )
}
