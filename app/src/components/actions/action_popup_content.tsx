import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import ArrowCollapseVertical from 'mdi-material-ui/ArrowCollapseVertical'
import ArrowExpandVertical from 'mdi-material-ui/ArrowExpandVertical'
import Close from 'mdi-material-ui/Close'
import { useMemo } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionExecutionStatus } from '../../data/action_run_types'
import type { ActionDefinition } from '../../data/action_types'
import type { AgentConversation } from '../../data/data_types'
import { worktreeService } from '../../services/project/worktree_service'
import { ResizablePopper } from '../resizable_popper'
import { WorktreeSelector, type WorktreeAssignment, type WorktreeAssignmentTarget } from '../worktree_selector'
import { ActionAgentPresetName } from './action_agent_preset_name'
import { ActionAgentPrompt } from './action_agent_prompt'
import { ActionAgentQuestion } from './action_agent_question'
import { ActionAgentSelectors } from './action_agent_selectors'
import { ActionConversationChat } from './action_conversation_chat'
import { ActionConversationPicker } from './action_conversation_picker'
import { ActionLogErrorDisplay } from './action_log_error_display'
import { ActionPhraseButtons } from './action_phrase_buttons'
import { ActionPopupBottomRow } from './action_popup_bottom_row'
import { statusColor } from './action_popup_defaults'
import { actionPopupRunDisabled } from './action_popup_run_disabled'
import { ActionPromptDraft } from './action_prompt_draft'
import { ActionRunHistory } from './action_run_history'
import { ActionRunStatus } from './action_run_status'
import { ActionScheduleForm } from './action_schedule_form'
import { ActionSelector } from './action_selector'
import { useActionPopupController } from './use_action_popup_controller'

export const CARD_RUN_POPUP_SIZE_STORAGE_KEY = 'md2.cardRunPopupSize'
export const PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY = 'md2.projectAgentPopupSize'

interface ActionPopupContentProps {
    activeActionStatuses: Record<string, ActionExecutionStatus>
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
    primaryPath: string | null
    showSaveControls: boolean
    titleId: string
    unseenResultActionIds?: string[]
}

/**
 * The message is rebuilt on every render but only reads the worktree list on the failing
 * path, so the popup never subscribes to worktree changes to keep a message it rarely shows.
 */
function worktreeValidationMessage(action: ActionDefinition, context: ActionContext) {
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

/** Presentation and execution behavior for the internally selected popup action. */
export function ActionPopupContent(props: ActionPopupContentProps) {
    const {
        action, actions, activeActionStatuses, anchorElement, assignmentContext, baseContext, draggable, fullHeight, onAddAction, onClose,
        onSelectAction, onToggleFullHeight, open, primaryPath, showSaveControls, titleId, unseenResultActionIds = [],
    } = props
    const controller = useActionPopupController({
        action,
        context: assignmentContext,
        scheduleContext: baseContext,
        enableConversations: action.type === 'agent',
        executionValidationError: worktreeValidationMessage(action, assignmentContext),
    })
    const sessionActive = controller.runStatus === 'queued'
        || controller.runStatus === 'running'
        || controller.runStatus === 'waitingForInput'
    const showAgentInteraction = action.type === 'agent' || controller.agentActive
    const sizeStorageKey = baseContext.kind === 'project'
        ? PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY
        : CARD_RUN_POPUP_SIZE_STORAGE_KEY
    const promptDraft = useMemo(
        () => new ActionPromptDraft(controller.prompt, controller.promptResetToken),
        [controller.prompt, controller.promptResetToken],
    )
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
    const handleRunShortcut = () => {
        const prompt = promptDraft.getSnapshot()
        if (actionPopupRunDisabled(action, controller, prompt, showSaveControls)) return
        if (showSaveControls) void controller.handleSaveAndRun(prompt)
        else void controller.handleRun(prompt)
    }

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
                            disabled={sessionActive}
                            primaryPath={primaryPath}
                        />
                    ) : null}
                    {action.type === 'agent' ? (
                        <ActionConversationPicker
                            conversations={controller.conversations}
                            disabled={sessionActive}
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
                    activeActionStatuses={activeActionStatuses}
                    adding={showSaveControls}
                    actions={actions}
                    onAdd={onAddAction}
                    onSelect={onSelectAction}
                    selectedAction={action}
                    unseenResultActionIds={unseenResultActionIds}
                />
            </Box>
            <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1 }}>
                {showAgentInteraction ? (
                    <Stack spacing={1} sx={{ flex: 1, minHeight: 0 }}>
                        {showSaveControls ? (
                            <ActionAgentPresetName
                                actionLabel={controller.actionLabel}
                                onActionLabelChange={controller.handleActionLabelChange}
                                onRunShortcut={handleRunShortcut}
                            />
                        ) : null}
                        <Box sx={{ alignItems: 'center', color: 'text.secondary', display: 'flex', flexWrap: 'wrap', fontSize: 12, gap: 0.75 }}>
                            {action.type === 'agent' ? (
                                <ActionAgentSelectors
                                    agent={controller.agent}
                                    agentAvailability={controller.agentAvailability}
                                    agentProfiles={controller.agentProfiles}
                                    disabled={sessionActive}
                                    model={controller.model}
                                    onAgentChange={controller.handleAgentChange}
                                    onModelChange={controller.handleModelChange}
                                    onThinkingLevelChange={controller.handleThinkingLevelChange}
                                    selectedAgentModels={controller.selectedAgentModels}
                                    thinkingLevel={controller.thinkingLevel}
                                />
                            ) : null}
                            <ActionLogErrorDisplay logs={controller.runLogs} />
                        </Box>
                        <ActionConversationChat
                            conversation={controller.displayedConversation}
                            onConversationViewed={props.onConversationViewed}
                            status={controller.runStatus}
                        />
                        <ActionAgentPrompt
                            convertMessage={controller.convertMessage}
                            disabled={false}
                            onPromptChange={controller.handlePromptChange}
                            onRunShortcut={handleRunShortcut}
                            promptDraft={promptDraft}
                            promptFailed={controller.promptPreparationFailed}
                            promptLoading={controller.promptPreparationPending}
                        />
                        {controller.structuredQuestion ? (
                            <ActionAgentQuestion
                                onAnswer={controller.handleAnswerQuestion}
                                questions={controller.structuredQuestion.questions}
                            />
                        ) : null}
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
            <ActionPopupBottomRow
                action={action}
                assignmentContext={assignmentContext}
                baseContext={baseContext}
                controller={controller}
                promptDraft={promptDraft}
                showSaveControls={showSaveControls}
            />
        </ResizablePopper>
    )
}
