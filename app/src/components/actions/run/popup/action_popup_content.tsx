import { Box, IconButton, Stack, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material'
import ArrowCollapseVertical from 'mdi-material-ui/ArrowCollapseVertical'
import ArrowExpandVertical from 'mdi-material-ui/ArrowExpandVertical'
import Close from 'mdi-material-ui/Close'
import { useMemo } from 'react'
import { actionContextIdentity, type ActionContext } from '../../../../data/action_context'
import type { ActionDefinition } from '../../../../data/action_types'
import { worktreeService } from '../../../../services/project/worktree_service'
import {
    actionRunSettingsService,
    createSessionActionRunSettingsStore,
} from '../../../../services/actions/action_run_settings_service'
import { ResizablePopper } from '../../../resizable_popper'
import type { WorktreeAssignmentTarget } from '../../../worktree_selector'
import { ActionAgentApprovals } from '../../agent/action_agent_approvals'
import { ActionAgentInteractionVisibility } from '../../agent/action_agent_interaction_visibility'
import { ActionAgentPromptOwner } from '../../agent/action_agent_prompt_owner'
import { ActionAgentQuestionOwner } from '../../agent/action_agent_question_owner'
import { ActionConversationChatOwner } from '../../conversation/action_conversation_chat_owner'
import { ActionConversationPickerOwner } from '../../conversation/action_conversation_picker_owner'
import { ActionConversationStore } from '../../conversation/action_conversation_store'
import { ActionHistoryStore } from '../state/action_history_store'
import { ActionLogErrorOwner } from '../../conversation/action_log_error_owner'
import { ActionPopupBottomRow } from './action_popup_bottom_row'
import { ActionUsageScopeStore } from './action_usage_scope_store'
import { ActionRunDisabledMessage } from './action_run_disabled_message'
import { ActionRunHistoryOwner } from '../state/action_run_history_owner'
import { ActionRunInputStore } from '../state/action_run_input_store'
import { ActionRunResultStore } from '../state/action_run_result_store'
import { ActionRunStatusOwner } from '../state/action_run_status_owner'
import { ActionScheduleOwner } from '../schedule/action_schedule_owner'
import { ActionScheduleStore } from '../schedule/action_schedule_store'
import { ActionSelector } from './action_selector'
import { ActionWorktreeSelectorOwner } from './action_worktree_selector_owner'
import { MarkdownTypeaheadLayerProvider } from '../../../editor/markdown_typeahead_layer_provider'

export const CARD_RUN_POPUP_SIZE_STORAGE_KEY = 'md2.cardRunPopupSize'
export const PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY = 'md2.projectAgentPopupSize'

interface ActionPopupBindings {
    conversationStore: ActionConversationStore
    historyStore: ActionHistoryStore
    inputStore: ActionRunInputStore
    resultStore: ActionRunResultStore
    scheduleStore: ActionScheduleStore
    usageScopeStore: ActionUsageScopeStore
}

function createActionPopupBindings(action: ActionDefinition, context: ActionContext): ActionPopupBindings {
    return {
        conversationStore: new ActionConversationStore(action.id, context),
        historyStore: new ActionHistoryStore(action, context),
        inputStore: new ActionRunInputStore(),
        resultStore: new ActionRunResultStore(),
        scheduleStore: new ActionScheduleStore(),
        usageScopeStore: new ActionUsageScopeStore(),
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
    onActivate?: () => void
    onClose: () => void
    onSelectAction: (actionId: string) => void
    onToggleFullHeight: () => void
    open: boolean
    popupEntryId?: string
    primaryPath: string | null
    readOnlyMessage: string | null
    stackPosition?: number
    target: string | null
    titleId: string
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
    if ((context.kind === 'card' || context.kind === 'file') && context.file && context.cardInternalId) {
        return { cardInternalId: context.cardInternalId, kind: 'card', path: context.file }
    }

    return null
}

/** Presentation and run behavior for the internally selected popup action. */
export function ActionPopupContent(props: ActionPopupContentProps) {
    const {
        action, actions, anchorElement, assignmentContext, baseContext, draggable, fullHeight, onActivate,
        onClose, onSelectAction, onToggleFullHeight, open, primaryPath, stackPosition, target, titleId,
        popupEntryId, readOnlyMessage,
    } = props
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const settingsContextIdentity = actionContextIdentity(assignmentContext)
    const settingsStore = useMemo(
        () => assignmentContext.cardInternalId
            ? actionRunSettingsService.getCardStore(assignmentContext.cardInternalId, action.id)
            : createSessionActionRunSettingsStore(action.id, settingsContextIdentity),
        [action.id, assignmentContext.cardInternalId, settingsContextIdentity],
    )
    const bindings = useMemo(
        () => createActionPopupBindings(action, assignmentContext),
        [action, assignmentContext],
    )
    const { conversationStore, historyStore, inputStore, resultStore, scheduleStore, usageScopeStore } = bindings
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
            draggable={isMobile ? false : draggable}
            fullHeight={isMobile || fullHeight}
            initialSize={{ height: 450, width: 400 }}
            labelId={titleId}
            onActivate={onActivate}
            onClose={onClose}
            open={open}
            paperSx={{
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: isMobile ? 0 : '14px',
                boxShadow: '0 24px 60px rgba(16,24,40,0.28)',
                flexDirection: 'column',
                height: isMobile ? '100vh !important' : undefined,
                left: isMobile ? '0 !important' : undefined,
                margin: isMobile ? '0 !important' : undefined,
                maxHeight: isMobile ? 'none' : undefined,
                maxWidth: isMobile ? 'none' : undefined,
                top: isMobile ? '0 !important' : undefined,
                transform: isMobile ? 'none !important' : undefined,
                width: isMobile ? '100vw !important' : undefined,
            }}
            resizeFromAllSides
            resizeLabel="Resize action popup"
            stackPosition={stackPosition}
            storageKey={isMobile ? undefined : sizeStorageKey}
        >
            <MarkdownTypeaheadLayerProvider stackPosition={stackPosition ?? 0}>
                <Typography
                    id={titleId}
                    sx={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}
                >
                    {target ? `Run actions for ${target}` : 'Run actions'}
                </Typography>
                <Box
                    data-drag-handle={!isMobile && draggable ? 'true' : undefined}
                    sx={{
                        borderBottom: 1, borderColor: 'divider', cursor: !isMobile && draggable ? 'move' : undefined,
                        display: 'flex', flexDirection: 'column', flexShrink: 0, gap: 1, px: 1.5, py: 1.5,
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
                        {assignmentTarget && !readOnlyMessage ? (
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
                        {!isMobile ? (
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
                        ) : null}
                        <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ flexShrink: 0, height: 30, width: 30 }}>
                            <Close sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Box>
                    <ActionSelector
                        actions={actions}
                        context={assignmentContext}
                        onSelect={onSelectAction}
                        selectedAction={action}
                    />
                </Box>
                {readOnlyMessage ? (
                    <Stack data-testid="action-popup-scroll-body" spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
                        {action.type === 'agent' ? (
                            <ActionConversationChatOwner
                                actionId={action.id}
                                context={assignmentContext}
                                popupEntryId={popupEntryId}
                                store={conversationStore}
                            />
                        ) : null}
                        <Typography color="text.secondary" role="note" variant="caption">{readOnlyMessage}</Typography>
                    </Stack>
                ) : <>
                    <Stack data-testid="action-popup-scroll-body" spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
                        <ActionAgentInteractionVisibility action={action} context={assignmentContext}>
                            <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                                <ActionLogErrorOwner actionId={action.id} context={assignmentContext} resultStore={resultStore} />
                                <ActionConversationChatOwner
                                    actionId={action.id}
                                    context={assignmentContext}
                                    popupEntryId={popupEntryId}
                                    store={conversationStore}
                                />
                                <ActionAgentPromptOwner
                                    action={action}
                                    context={assignmentContext}
                                    conversationStore={conversationStore}
                                    historyStore={historyStore}
                                    inputStore={inputStore}
                                    settingsStore={settingsStore}
                                    resultStore={resultStore}
                                    runValidationError={runValidationError}
                                />
                                <ActionAgentApprovals actionId={action.id} context={assignmentContext} />
                                <ActionAgentQuestionOwner actionId={action.id} context={assignmentContext} />
                            </Stack>
                        </ActionAgentInteractionVisibility>
                        <ActionScheduleOwner action={action} context={baseContext} store={scheduleStore} />
                        {action.type !== 'agent' ? (
                            <ActionRunStatusOwner actionId={action.id} context={assignmentContext} resultStore={resultStore} />
                        ) : null}
                        <ActionRunDisabledMessage action={action} settingsStore={settingsStore} />
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
                        settingsStore={settingsStore}
                        resultStore={resultStore}
                        runValidationError={runValidationError}
                        scheduleStore={scheduleStore}
                        usageScopeStore={usageScopeStore}
                    />
                </>}
            </MarkdownTypeaheadLayerProvider>
        </ResizablePopper>
    )
}
