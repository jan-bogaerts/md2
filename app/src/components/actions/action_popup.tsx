import { Box, Button, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import CalendarOutline from 'mdi-material-ui/CalendarOutline'
import ArrowCollapseVertical from 'mdi-material-ui/ArrowCollapseVertical'
import ArrowExpandVertical from 'mdi-material-ui/ArrowExpandVertical'
import Close from 'mdi-material-ui/Close'
import Play from 'mdi-material-ui/Play'
import { useId, useState } from 'react'
import type { ActionContext } from '../../data/action_context'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../data/action_types'
import type { AgentConversation } from '../../data/data_types'
import { ResizablePopper } from '../resizable_popper'
import { ResizablePopover } from '../resizable_popover'
import {
    statusColor,
    type ConvertPromptToAction,
    type LoadConversation,
    type LoadConversations,
    type LoadHistory,
    type PreparePrompt,
    type RunAction,
    type ScheduleAction,
} from './action_popup_defaults'
import { RelatedActions } from './action_related_actions'
import { ActionRunHistory } from './action_run_history'
import { ActionRunStatus } from './action_run_status'
import { ActionScheduleForm } from './action_schedule_form'
import { ActionAgentForm } from './action_agent_form'
import { ActionSelector } from './action_selector'
import { useActionPopupController } from './use_action_popup_controller'
import { ActionConversationChat } from './action_conversation_chat'
import { ActionConversationPicker } from './action_conversation_picker'
import { ActionPhraseButtons } from './action_phrase_buttons'
import { ActionUsageSummary } from './action_usage_summary'

interface ActionPopupProps {
    action: ActionDefinition
    actions?: ActionDefinition[]
    anchorElement: HTMLElement | null
    continueFrom?: string
    context: ActionContext
    initialPrompt?: string
    /** Open a new popup for a related (`before`/`after`) action with the same context. */
    onNavigate: (action: ActionDefinition) => void
    onAddAction?: () => void
    onClose: () => void
    onConversationViewed?: (conversation: AgentConversation) => void
    onSelectAction?: (action: ActionDefinition) => void
    showSaveControls?: boolean
    convertPromptToAction?: ConvertPromptToAction
    loadHistory?: LoadHistory
    loadConversation?: LoadConversation
    loadConversations?: LoadConversations
    preparePrompt?: PreparePrompt
    runAction?: RunAction
    scheduleAction?: ScheduleAction
}

export const CARD_RUN_POPUP_SIZE_STORAGE_KEY = 'md2.cardRunPopupSize'
export const PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY = 'md2.projectAgentPopupSize'

/**
 * The execution surface for a selected action and context: a resizable popup with
 * a `Run` command and shortcuts to the action's `before` and `after` actions.
 */
export function ActionPopup(props: ActionPopupProps) {
    const { action, actions, anchorElement, onAddAction, onClose, onNavigate, onSelectAction, showSaveControls = false } = props
    const isCardRunDialog = !!actions && !!onAddAction && !!onSelectAction
    const controller = useActionPopupController({ ...props, enableConversations: isCardRunDialog && action.type === 'agent' })
    const titleId = useId()
    const [fullHeight, setFullHeight] = useState(false)
    const promptRequired = action.id === CUSTOM_PROMPT_ACTION_ID
    const sizeStorageKey = props.context.kind === 'project'
        ? PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY
        : CARD_RUN_POPUP_SIZE_STORAGE_KEY
    const handleToggleFullHeight = () => setFullHeight((current) => !current)

    if (isCardRunDialog) {
        const handlePrimaryRun = showSaveControls ? controller.handleSaveAndRun : controller.handleRun
        const showUsageSummary = props.context.kind === 'card' && !!props.context.file
        const runDisabled = controller.runStatus === 'running'
            || !!controller.executionDisabledMessage
            || controller.promptPreparationPending
            || controller.promptPreparationFailed
            || (promptRequired && controller.prompt.trim().length === 0)
            || (showSaveControls && controller.saveDisabled)

        return (
            <ResizablePopper
                anchorElement={anchorElement}
                fullHeight={fullHeight}
                initialSize={{ height: 450, width: 400 }}
                labelId={titleId}
                onClose={onClose}
                open={!!anchorElement}
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
                <Box sx={{ alignItems: 'flex-start', borderBottom: 1, borderColor: 'divider', display: 'flex', gap: 1, px: 1.5, py: 1.5 }}>
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
                            onClick={handleToggleFullHeight}
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
                    {showUsageSummary && action.type === 'agent' && props.context.file ? (
                        <ActionUsageSummary
                            actionId={action.id}
                            cardPath={props.context.file}
                            conversations={controller.conversations}
                            history={controller.history}
                        />
                    ) : null}
                    <Box sx={{ flex: 1 }} />
                    {controller.runStatus === 'running' ? (
                        <Button disabled={!controller.backendAvailable} onClick={controller.handleCancel} size="small" variant="outlined">Cancel</Button>
                    ) : null}
                    {showSaveControls ? (
                        <Button
                            disabled={controller.saveDisabled}
                            onClick={controller.handleConvertToAction}
                            size="small"
                            variant="outlined"
                        >
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

    return (
        <ResizablePopover
            anchorElement={anchorElement}
            initialSize={{ height: 320, width: 420 }}
            labelId={titleId}
            onClose={onClose}
            open={!!anchorElement}
            resizeFromAllSides
            resizeLabel="Resize action popup"
        >
            <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
                <Box>
                    <Typography id={titleId} variant="h6">{action.label}</Typography>
                    {action.description ? (
                        <Typography color="text.secondary" variant="body2">
                            {action.description}
                        </Typography>
                    ) : null}
                </Box>

                <Stack direction="row" spacing={1}>
                    <Button
                        disabled={controller.runStatus === 'running' || !controller.backendAvailable}
                        onClick={controller.handleToggleSchedule}
                        variant="outlined"
                    >
                        Schedule
                    </Button>
                    {controller.runStatus === 'running' ? (
                        <Button disabled={!controller.backendAvailable} onClick={controller.handleCancel} variant="outlined">Cancel</Button>
                    ) : (
                        <Button
                            disabled={!!controller.executionDisabledMessage
                                || controller.promptPreparationPending
                                || controller.promptPreparationFailed
                                || (promptRequired && controller.prompt.trim().length === 0)}
                            onClick={controller.handleRun}
                            variant="contained"
                        >
                            {controller.isFollowUp ? 'Continue' : 'Run'}
                        </Button>
                    )}
                    <Button onClick={onClose}>Close</Button>
                </Stack>

                {controller.scheduleOpen ? (
                    <ActionScheduleForm
                        message={controller.scheduleMessage}
                        onRegister={controller.handleScheduleAction}
                        onTimestampChange={controller.handleScheduleTimestampChange}
                        timestamp={controller.scheduleTimestamp}
                    />
                ) : null}

                {action.type === 'agent' ? (
                    <ActionAgentForm
                        actionLabel={controller.actionLabel}
                        agent={controller.agent}
                        agentAvailability={controller.agentAvailability}
                        agentProfiles={controller.agentProfiles}
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

                {controller.runStatus !== 'idle' ? (
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

                <Divider />

                <ActionRunHistory entries={controller.history} error={controller.historyError} />

                <RelatedActions actions={action.onBefore} label="Before" onNavigate={onNavigate} />
                <RelatedActions actions={action.onAfter} label="After" onNavigate={onNavigate} />
            </Stack>
        </ResizablePopover>
    )
}
