import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import ArrowCollapseVertical from 'mdi-material-ui/ArrowCollapseVertical'
import ArrowExpandVertical from 'mdi-material-ui/ArrowExpandVertical'
import Close from 'mdi-material-ui/Close'
import { useMemo } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'
import type { AgentConversation } from '../../data/data_types'
import { worktreeService } from '../../services/project/worktree_service'
import { ResizablePopper } from '../resizable_popper'
import type { WorktreeAssignmentTarget } from '../worktree_selector'
import { ActionAgentApprovals } from './action_agent_approvals'
import { ActionAgentInteractionVisibility } from './action_agent_interaction_visibility'
import { ActionAgentPresetNameOwner } from './action_agent_preset_name_owner'
import { ActionAgentPromptOwner } from './action_agent_prompt_owner'
import { ActionAgentQuestionOwner } from './action_agent_question_owner'
import { ActionAgentSelectorsOwner } from './action_agent_selectors_owner'
import { ActionConversationChatOwner } from './action_conversation_chat_owner'
import { ActionConversationPickerOwner } from './action_conversation_picker_owner'
import { ActionConversationStore } from './action_conversation_store'
import { ActionHistoryStore } from './action_history_store'
import { ActionLogErrorOwner } from './action_log_error_owner'
import { ActionPhraseButtonsOwner } from './action_phrase_buttons_owner'
import { ActionPopupBottomRow } from './action_popup_bottom_row'
import { ActionRunDisabledMessage } from './action_run_disabled_message'
import { ActionRunHistoryOwner } from './action_run_history_owner'
import { ActionRunInputStore } from './action_run_input_store'
import { ActionRunResultStore } from './action_run_result_store'
import { ActionRunStatusOwner } from './action_run_status_owner'
import { ActionScheduleOwner } from './action_schedule_owner'
import { ActionScheduleStore } from './action_schedule_store'
import { ActionSelector } from './action_selector'
import { ActionWorktreeSelectorOwner } from './action_worktree_selector_owner'
import { MarkdownTypeaheadLayerProvider } from '../editor/markdown_typeahead_layer_provider'

export const CARD_RUN_POPUP_SIZE_STORAGE_KEY = 'md2.cardRunPopupSize'
export const PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY = 'md2.projectAgentPopupSize'

interface ActionPopupBindings {
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    scheduleStore: ActionScheduleStore
}

function createActionPopupBindings(action: ActionDefinition, context: ActionContext): ActionPopupBindings {
    return {
        conversationStore: new ActionConversationStore(action.id, context),
        historyStore: new ActionHistoryStore(action, context),
        inputStore: new ActionRunInputStore(),
        resultStore: new ActionRunResultStore(),
        scheduleStore: new ActionScheduleStore(),
    }
}

interface ActionPopupContentProps {
    action: ActionDefinition
    actions: ActionDefinition[]
    anchorElement: HTMLElement | null
    assignmentContext: ActionContext
    baseContext: ActionContext
    draggable?: boolean
    fullHeight: boolean
    onAddAction: () => void
    onActivate?: () => void
    onClose: () => void
    onConversationViewed?: (conversation: AgentConversation) => void
    onSelectAction: (actionId: string) => void
    onToggleFullHeight: () => void
    open: boolean
    primaryPath: string | null
    showSaveControls: boolean
    stackPosition?: number
    target: string | null
    titleId: string
    unseenResultConversations?: AgentConversation[]
}

/**
 * The message is rebuilt on every render but only reads the worktree list on the failing
 * path, so the popup never subscribes to worktree changes to keep a message it rarely shows.
 */
function worktreeValidationMessage(action: ActionDefinition, context: ActionContext) {
    const hasWorktreeAssignment = context.worktree !== undefined || !!context.worktreeError
    if (!hasWorktreeAssignment && !action.needsWorkTree) return null
    if (context.kind !== 'card' && context.kind !== 'project') {
        const reason = action.needsWorkTree ? 'when needsWorkTree is set' : 'for a worktree run'
        return `Action "${action.label}" requires card or project context ${reason}`
    }
    if (context.worktreeError) return context.worktreeError
    if (context.worktree === undefined) return `Action "${action.label}" requires a worktree assignment`
    if (!/^[1-9]\d*$/u.test(context.worktree)) return `Invalid worktree index: ${context.worktree}`

    const worktree = Number.parseInt(context.worktree, 10)
    if (!Number.isSafeInteger(worktree)) return `Invalid worktree index: ${context.worktree}`
    const record = worktreeService.getRecords()[worktree - 1]
    if (!record) return `Configured worktree ${worktree} does not exist`
    if (!record.valid) return `Configured worktree ${worktree} is invalid: ${record.error}`

    return null
}

function worktreeAssignmentTarget(context: ActionContext): WorktreeAssignmentTarget | null {
    if (context.kind === 'project') return { kind: 'project' }
    if ((context.kind === 'card' || context.kind === 'file') && context.file) return { kind: 'card', path: context.file }

    return null
}

/** Presentation and run behavior for the internally selected popup action. */
export function ActionPopupContent(props: ActionPopupContentProps) {
    const {
        action, actions, anchorElement, assignmentContext, baseContext, draggable, fullHeight, onActivate, onAddAction,
        onClose, onSelectAction, onToggleFullHeight, open, primaryPath, showSaveControls, stackPosition, target, titleId,
        unseenResultConversations = [],
    } = props
    const bindings = useMemo(
        () => createActionPopupBindings(action, assignmentContext),
        [action, assignmentContext],
    )
    const { conversationStore, historyStore, inputStore, resultStore, scheduleStore } = bindings
    const unseenResultConversation = unseenResultConversations.find(({ actionId }) => actionId === action.id) ?? null
    const unseenResultActionIds = unseenResultConversations.flatMap(({ actionId }) => actionId ? [actionId] : [])
    conversationStore.configureInitialSelection(unseenResultConversation?.path ?? null)
    const runValidationError = worktreeValidationMessage(action, assignmentContext)
    const sizeStorageKey = baseContext.kind === 'project'
        ? PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY
        : CARD_RUN_POPUP_SIZE_STORAGE_KEY
    const parsedWorktree = assignmentContext.worktree && /^[1-9]\d*$/u.test(assignmentContext.worktree)
        ? Number.parseInt(assignmentContext.worktree, 10)
        : null
    const worktreeAssignment = {
        worktree: parsedWorktree,
        worktreeError: assignmentContext.worktreeError ?? null,
        worktreeValue: assignmentContext.worktree ?? null,
    }
    const assignmentTarget = baseContext.kind === 'card' || baseContext.kind === 'file' || baseContext.kind === 'project'
        ? worktreeAssignmentTarget(baseContext)
        : null
    return (
        <ResizablePopper
            anchorElement={anchorElement}
            draggable={draggable}
            fullHeight={fullHeight}
            initialSize={{ height: 450, width: 400 }}
            labelId={titleId}
            onActivate={onActivate}
            onClose={onClose}
            open={open}
            paperSx={{
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: '14px',
                boxShadow: '0 24px 60px rgba(16,24,40,0.28)',
                flexDirection: 'column',
            }}
            resizeFromAllSides
            resizeLabel="Resize action popup"
            stackPosition={stackPosition}
            storageKey={sizeStorageKey}
        >
            <MarkdownTypeaheadLayerProvider stackPosition={stackPosition ?? 0}>
                <Typography
                    id={titleId}
                    sx={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}
                >
                    {target ? `Run actions for ${target}` : 'Run actions'}
                </Typography>
                <Box
                    data-drag-handle={draggable ? 'true' : undefined}
                    sx={{
                        borderBottom: 1, borderColor: 'divider', cursor: draggable ? 'move' : undefined,
                        display: 'flex', flexDirection: 'column', gap: 1, px: 1.5, py: 1.5,
                    }}
                >
                    <Box data-testid="action-popup-toolbar" sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                        {target ? (
                            <Box
                                component="span"
                                sx={{
                                    bgcolor: 'custom.primaryBg', borderRadius: '5px', color: 'primary.main', flexShrink: 0,
                                    fontFamily: '"Roboto Mono", ui-monospace, monospace', fontSize: 11.5, fontWeight: 600,
                                    px: 0.875, py: 0.25,
                                }}
                            >
                                {target}
                            </Box>
                        ) : null}
                        {assignmentTarget ? (
                            <ActionWorktreeSelectorOwner
                                actionId={action.id}
                                assignment={worktreeAssignment}
                                assignmentTarget={assignmentTarget}
                                context={assignmentContext}
                                primaryPath={primaryPath}
                            />
                        ) : null}
                        {action.type === 'agent' ? (
                            <ActionConversationPickerOwner
                                actionId={action.id}
                                context={assignmentContext}
                                store={conversationStore}
                            />
                        ) : null}
                        <Box sx={{ flex: 1 }} />
                        <Tooltip title={fullHeight ? 'Collapse downward' : 'Expand upward'}>
                            <IconButton
                                aria-label={fullHeight ? 'Collapse downward' : 'Expand upward'}
                                onClick={onToggleFullHeight}
                                size="small"
                                sx={{ flexShrink: 0, height: 30, width: 30 }}
                            >
                                {fullHeight
                                    ? <ArrowCollapseVertical sx={{ fontSize: 18 }} />
                                    : <ArrowExpandVertical sx={{ fontSize: 18 }} />}
                            </IconButton>
                        </Tooltip>
                        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ flexShrink: 0, height: 30, width: 30 }}>
                            <Close sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>
                    <ActionSelector
                        adding={showSaveControls}
                        actions={actions}
                        context={assignmentContext}
                        onAdd={onAddAction}
                        onSelect={onSelectAction}
                        selectedAction={action}
                        unseenResultActionIds={unseenResultActionIds}
                    />
                </Box>
                <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
                    <ActionAgentInteractionVisibility action={action} context={assignmentContext}>
                        <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                            {showSaveControls ? (
                                <ActionAgentPresetNameOwner
                                    action={action}
                                    context={assignmentContext}
                                    conversationStore={conversationStore}
                                    historyStore={historyStore}
                                    inputStore={inputStore}
                                    resultStore={resultStore}
                                    runValidationError={runValidationError}
                                />
                            ) : null}
                            <Box sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex', flexWrap: 'wrap', fontSize: 12, gap: 0.75 }}>
                                {action.type === 'agent' ? (
                                    <ActionAgentSelectorsOwner
                                        action={action}
                                        context={assignmentContext}
                                        store={inputStore}
                                    />
                                ) : null}
                                <ActionLogErrorOwner actionId={action.id} context={assignmentContext} resultStore={resultStore} />
                            </Box>
                            <ActionConversationChatOwner
                                actionId={action.id}
                                context={assignmentContext}
                                onConversationViewed={props.onConversationViewed}
                                store={conversationStore}
                            />
                            <ActionAgentPromptOwner
                                action={action}
                                context={assignmentContext}
                                conversationStore={conversationStore}
                                historyStore={historyStore}
                                inputStore={inputStore}
                                resultStore={resultStore}
                                runValidationError={runValidationError}
                                showSaveControls={showSaveControls}
                            />
                            <ActionAgentApprovals actionId={action.id} context={assignmentContext} />
                            <ActionAgentQuestionOwner actionId={action.id} context={assignmentContext} />
                        </Stack>
                    </ActionAgentInteractionVisibility>
                    <ActionPhraseButtonsOwner
                        action={action}
                        context={assignmentContext}
                        conversationStore={conversationStore}
                        historyStore={historyStore}
                        inputStore={inputStore}
                        resultStore={resultStore}
                        runValidationError={runValidationError}
                    />
                    <ActionScheduleOwner action={action} context={baseContext} store={scheduleStore} />
                    {action.type !== 'agent' ? (
                        <ActionRunStatusOwner actionId={action.id} context={assignmentContext} resultStore={resultStore} />
                    ) : null}
                    <ActionRunDisabledMessage action={action} store={inputStore} />
                    {runValidationError ? (
                        <Typography color="error.main" role="alert" variant="caption">
                            {runValidationError}
                        </Typography>
                    ) : null}
                    {action.type !== 'agent' ? (
                        <ActionRunHistoryOwner store={historyStore} />
                    ) : null}
                </Stack>
                <ActionPopupBottomRow
                    action={action}
                    assignmentContext={assignmentContext}
                    conversationStore={conversationStore}
                    historyStore={historyStore}
                    inputStore={inputStore}
                    resultStore={resultStore}
                    runValidationError={runValidationError}
                    scheduleStore={scheduleStore}
                    showSaveControls={showSaveControls}
                />
            </MarkdownTypeaheadLayerProvider>
        </ResizablePopper>
    )
}
