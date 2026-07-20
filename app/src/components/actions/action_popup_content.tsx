import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import CalendarOutline from 'mdi-material-ui/CalendarOutline'
import ArrowCollapseVertical from 'mdi-material-ui/ArrowCollapseVertical'
import ArrowExpandVertical from 'mdi-material-ui/ArrowExpandVertical'
import Close from 'mdi-material-ui/Close'
import Play from 'mdi-material-ui/Play'
import type { ActionContext } from '../../data/action_context'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../data/action_types'
import type { AgentConversation } from '../../data/data_types'
import { ResizablePopper } from '../resizable_popper'
import { ActionAgentForm } from './action_agent_form'
import { ActionConversationChat } from './action_conversation_chat'
import { ActionConversationPicker } from './action_conversation_picker'
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

interface ActionPopupContentProps {
    action: ActionDefinition
    actions: ActionDefinition[]
    anchorElement: HTMLElement | null
    context: ActionContext
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
}

/** Presentation and execution behavior for the internally selected popup action. */
export function ActionPopupContent(props: ActionPopupContentProps) {
    const {
        action, actions, anchorElement, context, draggable, fullHeight, onAddAction, onClose, onSelectAction,
        onToggleFullHeight, open, showSaveControls, titleId,
    } = props
    const controller = useActionPopupController({
        action,
        context,
        enableConversations: action.type === 'agent',
    })
    const promptRequired = action.id === CUSTOM_PROMPT_ACTION_ID
    const sizeStorageKey = context.kind === 'project'
        ? PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY
        : CARD_RUN_POPUP_SIZE_STORAGE_KEY
    const handlePrimaryRun = showSaveControls ? controller.handleSaveAndRun : controller.handleRun
    const showUsageSummary = context.kind === 'card' && !!context.file
    const runDisabled = controller.runStatus === 'running'
        || !!controller.executionDisabledMessage
        || controller.promptPreparationPending
        || controller.promptPreparationFailed
        || (promptRequired && controller.prompt.trim().length === 0)
        || (showSaveControls && controller.saveDisabled)

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
                    alignItems: 'flex-start', borderBottom: 1, borderColor: 'divider', cursor: draggable ? 'move' : undefined,
                    display: 'flex', gap: 1, px: 1.5, py: 1.5,
                }}
            >
                <ActionSelector
                    adding={showSaveControls}
                    actions={actions}
                    onAdd={onAddAction}
                    onSelect={onSelectAction}
                    selectedAction={action}
                />
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
            <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 2.5, py: 2.25 }}>
                {action.type === 'agent' ? (
                    <ActionAgentForm
                        actionLabel={controller.actionLabel}
                        agent={controller.agent}
                        agentAvailability={controller.agentAvailability}
                        agentProfiles={controller.agentProfiles}
                        compact
                        conversationContent={(
                            <ActionConversationChat
                                conversation={controller.displayedConversation}
                                logs={controller.runLogs}
                                onConversationViewed={props.onConversationViewed}
                                status={controller.runStatus}
                            />
                        )}
                        conversationPicker={(
                            <ActionConversationPicker
                                conversations={controller.conversations}
                                disabled={controller.runStatus === 'running'}
                                loading={controller.conversationHistoryLoading}
                                onChange={controller.handleConversationChange}
                                selectedPath={controller.displayedConversation?.path ?? ''}
                            />
                        )}
                        convertMessage={controller.convertMessage}
                        disabled={controller.runStatus === 'running'}
                        prompt={controller.prompt}
                        promptFailed={controller.promptPreparationFailed}
                        promptLoading={controller.promptPreparationPending}
                        model={controller.model}
                        onActionLabelChange={controller.handleActionLabelChange}
                        onAgentChange={controller.handleAgentChange}
                        onConvertToAction={controller.handleConvertToAction}
                        onPromptChange={controller.handlePromptChange}
                        onModelChange={controller.handleModelChange}
                        onThinkingLevelChange={controller.handleThinkingLevelChange}
                        onRunShortcut={runDisabled ? undefined : handlePrimaryRun}
                        onSaveAndRun={controller.handleSaveAndRun}
                        promptRequired={promptRequired}
                        promptResetToken={controller.promptResetToken}
                        saveDisabled={controller.saveDisabled}
                        selectedAgentModels={controller.selectedAgentModels}
                        showSaveControls={showSaveControls}
                        thinkingLevel={controller.thinkingLevel}
                    />
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
                {action.type !== 'agent' ? (
                    <ActionRunHistory compact entries={controller.history} error={controller.historyError} />
                ) : null}
            </Stack>
            <Box sx={{ alignItems: 'center', bgcolor: 'background.default', borderTop: 1, borderColor: 'divider', display: 'flex', gap: 1, px: 2, py: 1.5 }}>
                {showUsageSummary && action.type === 'agent' && context.cardInternalId ? (
                    <ActionUsageSummary
                        actionId={action.id}
                        cardInternalId={context.cardInternalId}
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
