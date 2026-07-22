import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import CalendarOutline from 'mdi-material-ui/CalendarOutline'
import ArrowCollapseVertical from 'mdi-material-ui/ArrowCollapseVertical'
import ArrowExpandVertical from 'mdi-material-ui/ArrowExpandVertical'
import Close from 'mdi-material-ui/Close'
import Play from 'mdi-material-ui/Play'
import type { ActionContext } from '../../data/action_context'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../data/action_types'
import type { AgentConversation } from '../../data/data_types'
import type { WorktreeRecord } from '../../data/data_types'
import { ResizablePopper } from '../resizable_popper'
import { WorktreeSelector, type WorktreeAssignment, type WorktreeAssignmentTarget } from '../worktree_selector'
import { ActionAgentPresetName } from './action_agent_preset_name'
import { ActionAgentPrompt } from './action_agent_prompt'
import { ActionAgentSelectors } from './action_agent_selectors'
import { ActionConversationChat } from './action_conversation_chat'
import { ActionConversationPicker } from './action_conversation_picker'
import { ActionLogErrorDisplay } from './action_log_error_display'
import { ActionPhraseButtons } from './action_phrase_buttons'
import { statusColor } from './action_popup_defaults'
import { ActionRunHistory } from './action_run_history'
import { ActionRunStatus } from './action_run_status'
import { ActionScheduleForm } from './action_schedule_form'
import { ActionSelector } from './action_selector'
import { ActionUsageSummary } from './action_usage_summary'
import { useActionPopupController } from './use_action_popup_controller'

export const CARD_RUN_POPUP_SIZE_STORAGE_KEY = 'md2.cardRunPopupSize'
export const PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY = 'md2.projectAgentPopupSize'
const MIN_CHAT_HEIGHT = 96

interface ActionPopupContentProps {
    action: ActionDefinition
    actions: ActionDefinition[]
    anchorElement: HTMLElement | null
    assignmentContext: ActionContext
    baseContext: ActionContext
    draggable?: boolean
    fullHeight: boolean
    onAddAction: () => void
    onClose: () => void
    onConversationViewed?: (conversation: AgentConversation) => void
    onSelectAction: (actionId: string) => void
    onToggleFullHeight: () => void
    open: boolean
    showSaveControls: boolean
    titleId: string
    primaryPath: string | null
    worktrees: WorktreeRecord[]
}

function worktreeValidationMessage(action: ActionDefinition, context: ActionContext, worktrees: WorktreeRecord[]) {
    const hasWorktreeAssignment = context.worktree !== undefined || !!context.worktreeError
    if (!hasWorktreeAssignment && !action.needsWorkTree) return null
    if (context.kind !== 'card' && context.kind !== 'project') {
        const reason = action.needsWorkTree ? 'when needsWorkTree is set' : 'for worktree execution'
        return `Action "${action.label}" requires card or project context ${reason}`
    }
    if (context.worktreeError) return context.worktreeError
    if (context.worktree === undefined) return `Action "${action.label}" requires a worktree assignment`
    if (!/^[1-9]\d*$/u.test(context.worktree)) return `Invalid worktree index: ${context.worktree}`

    const worktree = Number.parseInt(context.worktree, 10)
    if (!Number.isSafeInteger(worktree)) return `Invalid worktree index: ${context.worktree}`
    const record = worktrees[worktree - 1]
    if (!record) return `Configured worktree ${worktree} does not exist`
    if (!record.valid) return `Configured worktree ${worktree} is invalid: ${record.error}`

    return null
}

function worktreeAssignmentTarget(context: ActionContext): WorktreeAssignmentTarget {
    if (context.kind === 'project') return { kind: 'project' }
    if ((context.kind === 'card' || context.kind === 'file') && context.file) return { kind: 'card', path: context.file }

    throw new Error('Worktree assignment requires card, file, or project context')
}

/** Presentation and execution behavior for the internally selected popup action. */
export function ActionPopupContent(props: ActionPopupContentProps) {
    const {
        action, actions, anchorElement, assignmentContext, baseContext, draggable, fullHeight, onAddAction, onClose, onSelectAction,
        onToggleFullHeight, open, primaryPath, showSaveControls, titleId, worktrees,
    } = props
    const controller = useActionPopupController({
        action,
        context: assignmentContext,
        scheduleContext: baseContext,
        enableConversations: action.type === 'agent',
        executionValidationError: worktreeValidationMessage(action, assignmentContext, worktrees),
    })
    const promptRequired = action.id === CUSTOM_PROMPT_ACTION_ID
    const sizeStorageKey = baseContext.kind === 'project'
        ? PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY
        : CARD_RUN_POPUP_SIZE_STORAGE_KEY
    const handlePrimaryRun = showSaveControls ? controller.handleSaveAndRun : controller.handleRun
    const showUsageSummary = baseContext.kind === 'card' && !!baseContext.file
    const runDisabled = controller.runStatus === 'running'
        || !!controller.executionDisabledMessage
        || controller.promptPreparationPending
        || controller.promptPreparationFailed
        || (promptRequired && controller.prompt.trim().length === 0)
        || (showSaveControls && controller.saveDisabled)
    const parsedWorktree = assignmentContext.worktree && /^[1-9]\d*$/u.test(assignmentContext.worktree)
        ? Number.parseInt(assignmentContext.worktree, 10)
        : null
    const worktreeAssignment: WorktreeAssignment = {
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
            storageKey={sizeStorageKey}
        >
            <Typography
                id={titleId}
                sx={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}
            >
                Run actions
            </Typography>
            <Box
                data-drag-handle={draggable ? 'true' : undefined}
                sx={{
                    borderBottom: 1, borderColor: 'divider', cursor: draggable ? 'move' : undefined,
                    display: 'flex', flexDirection: 'column', gap: 1, px: 1.5, py: 1.5,
                }}
            >
                <Box data-testid="action-popup-toolbar" sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                    {assignmentTarget ? (
                        <WorktreeSelector
                            assignment={worktreeAssignment}
                            assignmentTarget={assignmentTarget}
                            disabled={controller.runStatus === 'running'}
                            primaryPath={primaryPath}
                            worktrees={worktrees}
                        />
                    ) : null}
                    {action.type === 'agent' ? (
                        <ActionConversationPicker
                            conversations={controller.conversations}
                            disabled={controller.runStatus === 'running'}
                            loading={controller.conversationHistoryLoading}
                            onChange={controller.handleConversationChange}
                            selectedPath={controller.displayedConversation?.path ?? ''}
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
                            {fullHeight ? <ArrowCollapseVertical sx={{ fontSize: 18 }} /> : <ArrowExpandVertical sx={{ fontSize: 18 }} />}
                        </IconButton>
                    </Tooltip>
                    <IconButton aria-label="Close" onClick={onClose} size="small" sx={{ flexShrink: 0, height: 30, width: 30 }}>
                        <Close sx={{ fontSize: 18 }} />
                    </IconButton>
                </Box>
                <ActionSelector
                    adding={showSaveControls}
                    actions={actions}
                    onAdd={onAddAction}
                    onSelect={onSelectAction}
                    selectedAction={action}
                />
            </Box>
            <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
                {action.type === 'agent' ? (
                    <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                        {showSaveControls ? (
                            <ActionAgentPresetName
                                actionLabel={controller.actionLabel}
                                onActionLabelChange={controller.handleActionLabelChange}
                                onRunShortcut={runDisabled ? undefined : handlePrimaryRun}
                            />
                        ) : null}
                        <Box sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex', flexWrap: 'wrap', fontSize: 12, gap: 0.75 }}>
                            <ActionAgentSelectors
                                agent={controller.agent}
                                agentAvailability={controller.agentAvailability}
                                agentProfiles={controller.agentProfiles}
                                disabled={controller.runStatus === 'running'}
                                model={controller.model}
                                onAgentChange={controller.handleAgentChange}
                                onModelChange={controller.handleModelChange}
                                onThinkingLevelChange={controller.handleThinkingLevelChange}
                                selectedAgentModels={controller.selectedAgentModels}
                                thinkingLevel={controller.thinkingLevel}
                            />
                            <ActionLogErrorDisplay logs={controller.runLogs} />
                        </Box>
                        <Box sx={{ flex: 1, minHeight: MIN_CHAT_HEIGHT, overflowY: 'auto' }}>
                            <ActionConversationChat
                                conversation={controller.displayedConversation}
                                onConversationViewed={props.onConversationViewed}
                                status={controller.runStatus}
                            />
                        </Box>
                        <ActionAgentPrompt
                            convertMessage={controller.convertMessage}
                            disabled={controller.runStatus === 'running'}
                            onPromptChange={controller.handlePromptChange}
                            onRunShortcut={runDisabled ? undefined : handlePrimaryRun}
                            prompt={controller.prompt}
                            promptFailed={controller.promptPreparationFailed}
                            promptLoading={controller.promptPreparationPending}
                            promptResetToken={controller.promptResetToken}
                        />
                    </Stack>
                ) : null}
                {controller.isFollowUp && action.phrases.length > 0 ? (
                    <ActionPhraseButtons
                        onDoubleClick={controller.handlePhraseDoubleClick}
                        onSelect={controller.handlePhraseSelect}
                        phrases={action.phrases}
                    />
                ) : null}
                {controller.scheduleOpen ? (
                    <ActionScheduleForm
                        message={controller.scheduleMessage}
                        onRegister={controller.handleScheduleAction}
                        onTimestampChange={controller.handleScheduleTimestampChange}
                        timestamp={controller.scheduleTimestamp}
                    />
                ) : null}
                {action.type !== 'agent' && controller.runStatus !== 'idle' ? (
                    <ActionRunStatus
                        color={statusColor(controller.runStatus)}
                        logs={controller.runLogs}
                        status={controller.runStatus}
                    />
                ) : null}
                {controller.executionDisabledMessage ? (
                    <Typography color="text.secondary" role="note" variant="caption">
                        {controller.executionDisabledMessage}
                    </Typography>
                ) : null}
                {controller.executionValidationError ? (
                    <Typography color="error.main" role="alert" variant="caption">
                        {controller.executionValidationError}
                    </Typography>
                ) : null}
                {action.type !== 'agent' ? (
                    <ActionRunHistory compact entries={controller.history} error={controller.historyError} />
                ) : null}
            </Stack>
            <Box sx={{ alignItems: 'center', bgcolor: 'background.default', borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1, px: 2, py: 1.5 }}>
                {showUsageSummary && action.type === 'agent' && assignmentContext.cardInternalId ? (
                    <ActionUsageSummary
                        actionId={action.id}
                        cardInternalId={assignmentContext.cardInternalId}
                        conversations={controller.conversations}
                        history={controller.history}
                    />
                ) : null}
                <Box sx={{ flex: 1 }} />
                {controller.runStatus === 'running' ? (
                    <Button disabled={!controller.backendAvailable} onClick={controller.handleCancel} size="small" variant="outlined">Cancel</Button>
                ) : null}
                {showSaveControls ? (
                    <Button disabled={controller.saveDisabled} onClick={controller.handleConvertToAction} size="small" variant="outlined">
                        Save
                    </Button>
                ) : null}
                <Button
                    disabled={controller.runStatus === 'running' || !controller.backendAvailable}
                    onClick={controller.handleToggleSchedule}
                    size="small"
                    startIcon={<CalendarOutline sx={{ fontSize: '14px !important' }} />}
                    sx={{
                        bgcolor: 'background.paper',
                        borderColor: 'divider',
                        color: 'text.secondary',
                        height: 34,
                        '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
                    }}
                    variant="outlined"
                >
                    Schedule
                </Button>
                <Button
                    disabled={runDisabled}
                    onClick={handlePrimaryRun}
                    size="small"
                    startIcon={<Play sx={{ fontSize: '13px !important' }} />}
                    sx={{ height: 34, px: 2 }}
                    variant="contained"
                >
                    {controller.isFollowUp ? 'Continue' : 'Run'}
                </Button>
            </Box>
        </ResizablePopper>
    )
}
