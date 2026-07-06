import { Box, Button, Dialog, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { ActionScheduleTrigger } from '../../data/action_schedule_types'
import type { ActionDefinition } from '../../data/action_types'
import { getElectronActionBridge, type ActionRunHistoryEntry } from '../../data/electron_action_bridge'
import { actionRunner, type ActionRunInput, type ActionRunResult, type ConvertPromptToActionInput } from '../../services/action_runner'
import { DiffView } from './diff_view'

/** Which lower corner the resize handle sits in, chosen by the popup's screen position. */
export type ResizeCorner = 'lower-left' | 'lower-right'

const MIN_WIDTH = 280
const MIN_HEIGHT = 200
const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 320
const HANDLE_SIZE = 16
const DEFAULT_CONVERT_LABEL_LENGTH = 40

type PopupRunStatus = 'idle' | 'running' | ActionRunResult['status']
type ConvertPromptToAction = (input: ConvertPromptToActionInput) => Promise<{ path: string }>
type LoadHistory = (action: ActionDefinition, context: ActionContext) => Promise<ActionRunHistoryEntry[]>
type RunAction = (action: ActionDefinition, context: ActionContext, input?: ActionRunInput) => Promise<ActionRunResult>
type ScheduleAction = (action: ActionDefinition, context: ActionContext, trigger: ActionScheduleTrigger) => Promise<void>
type ScheduleTriggerType = ActionScheduleTrigger['type']

interface ActionPopupProps {
    action: ActionDefinition
    context: ActionContext
    /** Open a new popup for a related (`before`/`after`) action with the same context. */
    onNavigate: (action: ActionDefinition) => void
    onClose: () => void
    convertPromptToAction?: ConvertPromptToAction
    loadHistory?: LoadHistory
    /** Lower corner to place the resize handle; defaults to lower-right. */
    resizeCorner?: ResizeCorner
    runAction?: RunAction
    scheduleAction?: ScheduleAction
}

interface RelatedActionsProps {
    actions: ActionDefinition[]
    label: string
    onNavigate: (action: ActionDefinition) => void
}

function RelatedActions(props: RelatedActionsProps) {
    if (props.actions.length === 0) return null

    return (
        <Box>
            <Typography color="text.secondary" variant="caption">
                {props.label}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mt: 0.5 }}>
                {props.actions.map((action) => (
                    <Button key={action.name} onClick={() => props.onNavigate(action)} size="small" variant="outlined">
                        {action.label}
                    </Button>
                ))}
            </Stack>
        </Box>
    )
}

interface HistoryEntryRowProps {
    entry: ActionRunHistoryEntry
}

/** One run history line; commit entries expose a toggleable diff view. */
function HistoryEntryRow(props: HistoryEntryRowProps) {
    const { entry } = props
    const [showDiff, setShowDiff] = useState(false)

    const handleToggleDiff = () => setShowDiff((previous) => !previous)

    return (
        <Box>
            <Typography color="text.secondary" variant="caption">
                {entry.status}: {entry.output || entry.prompt}
            </Typography>
            {entry.commit ? (
                <Box>
                    <Button onClick={handleToggleDiff} size="small">
                        {showDiff ? 'Hide diff' : 'Show diff'}
                    </Button>
                    {showDiff ? <DiffView entry={entry} /> : null}
                </Box>
            ) : null}
        </Box>
    )
}

function defaultRunAction(action: ActionDefinition, context: ActionContext, input?: ActionRunInput) {
    return actionRunner.run(action, context, input)
}

function defaultLoadHistory(action: ActionDefinition, context: ActionContext) {
    return actionRunner.loadHistory(action, context)
}

function defaultConvertPromptToAction(input: ConvertPromptToActionInput) {
    return actionRunner.convertPromptToAction(input)
}

async function defaultScheduleAction(action: ActionDefinition, context: ActionContext, trigger: ActionScheduleTrigger) {
    const bridge = getElectronActionBridge()
    if (!bridge?.registerActionSchedule) throw new Error('Scheduling actions requires Electron local mode')

    await bridge.registerActionSchedule({ actionName: action.name, context, trigger })
}

function statusColor(status: PopupRunStatus) {
    if (status === 'completed') return 'success.main'
    if (status === 'failed') return 'error.main'
    if (status === 'running') return 'info.main'

    return 'text.secondary'
}

function createScheduleTrigger(type: ScheduleTriggerType, timestampInput: string, afterActionNameInput: string): ActionScheduleTrigger {
    if (type === 'agentSlot') return { type: 'agentSlot' }
    if (type === 'afterAction') {
        const actionName = afterActionNameInput.trim()
        if (actionName.length === 0) throw new Error('Action name is required for after action schedules')

        return { actionName, type: 'afterAction' }
    }

    const timestamp = timestampInput.trim()
    if (timestamp.length === 0) throw new Error('Timestamp is required for time schedules')

    return { timestamp, type: 'at' }
}

/**
 * The execution surface for a selected action and context: a resizable popup with
 * a `Run` command and shortcuts to the action's `before` and `after` actions.
 * Activating a shortcut opens a new popup for that action.
 */
export function ActionPopup(props: ActionPopupProps) {
    const { action, context, onClose, onNavigate } = props
    const convertPromptToAction = props.convertPromptToAction ?? defaultConvertPromptToAction
    const loadHistory = props.loadHistory ?? defaultLoadHistory
    const resizeCorner = props.resizeCorner ?? 'lower-right'
    const runAction = props.runAction ?? defaultRunAction
    const scheduleAction = props.scheduleAction ?? defaultScheduleAction
    const [actionLabel, setActionLabel] = useState('')
    const [convertMessage, setConvertMessage] = useState<string | null>(null)
    const [extraPrompt, setExtraPrompt] = useState('')
    const [history, setHistory] = useState<ActionRunHistoryEntry[]>([])
    const [historyError, setHistoryError] = useState<string | null>(null)
    const [size, setSize] = useState({ height: DEFAULT_HEIGHT, width: DEFAULT_WIDTH })
    const [scheduleAfterActionName, setScheduleAfterActionName] = useState('')
    const [scheduleMessage, setScheduleMessage] = useState<string | null>(null)
    const [scheduleOpen, setScheduleOpen] = useState(false)
    const [scheduleTimestamp, setScheduleTimestamp] = useState('')
    const [scheduleTriggerType, setScheduleTriggerType] = useState<ScheduleTriggerType>('at')
    const [runResult, setRunResult] = useState<ActionRunResult | null>(null)
    const [runStatus, setRunStatus] = useState<PopupRunStatus>('idle')
    const resizeRef = useRef<AbortController | null>(null)

    useEffect(() => () => resizeRef.current?.abort(), [])

    useEffect(() => {
        let isActive = true

        async function loadRunHistory() {
            setHistoryError(null)
            try {
                const entries = await loadHistory(action, context)
                if (isActive) setHistory(entries)
            } catch (error) {
                if (isActive) setHistoryError(error instanceof Error ? error.message : 'Could not load run history')
            }
        }

        void loadRunHistory()

        return () => {
            isActive = false
        }
    }, [action, context, loadHistory])

    const handleRun = async () => {
        setRunStatus('running')
        setRunResult(null)

        try {
            const result = await runAction(action, context, { extraPrompt })
            setRunResult(result)
            setRunStatus(result.status)
            setHistory(await loadHistory(action, context))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Action run failed'
            setRunResult({
                logs: [{ actionName: action.name, command: null, message, phase: 'main', status: 'failed', stderr: message, stdout: '' }],
                status: 'failed',
            })
            setRunStatus('failed')
        }
    }

    const handleToggleSchedule = () => {
        setScheduleOpen((previous) => !previous)
        setScheduleMessage(null)
    }

    const handleScheduleTriggerTypeChange = (event: ChangeEvent<HTMLInputElement>) => {
        setScheduleTriggerType(event.target.value as ScheduleTriggerType)
        setScheduleMessage(null)
    }

    const handleScheduleTimestampChange = (event: ChangeEvent<HTMLInputElement>) => {
        setScheduleTimestamp(event.target.value)
        setScheduleMessage(null)
    }

    const handleScheduleAfterActionNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setScheduleAfterActionName(event.target.value)
        setScheduleMessage(null)
    }

    const handleScheduleAction = async () => {
        setScheduleMessage(null)

        try {
            const trigger = createScheduleTrigger(scheduleTriggerType, scheduleTimestamp, scheduleAfterActionName)
            await scheduleAction(action, context, trigger)
            setScheduleMessage('Schedule registered')
        } catch (error) {
            setScheduleMessage(error instanceof Error ? error.message : 'Could not register schedule')
        }
    }

    const handleExtraPromptChange = (event: ChangeEvent<HTMLInputElement>) => {
        setExtraPrompt(event.target.value)
        setConvertMessage(null)
    }

    const handleActionLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
        setActionLabel(event.target.value)
        setConvertMessage(null)
    }

    const handleConvertToAction = async () => {
        setConvertMessage(null)
        try {
            const label = actionLabel.trim().length > 0 ? actionLabel : extraPrompt.trim().slice(0, DEFAULT_CONVERT_LABEL_LENGTH)
            const result = await convertPromptToAction({ context, label, prompt: extraPrompt })
            setConvertMessage(`Saved ${result.path}`)
        } catch (error) {
            setConvertMessage(error instanceof Error ? error.message : 'Could not convert prompt to action')
        }
    }

    const startResize = (event: ReactPointerEvent) => {
        event.preventDefault()
        resizeRef.current?.abort()
        const controller = new AbortController()
        resizeRef.current = controller
        const start = { height: size.height, width: size.width, x: event.clientX, y: event.clientY }

        window.addEventListener('pointermove', (move: PointerEvent) => {
            const dx = move.clientX - start.x
            const dy = move.clientY - start.y
            const widthDelta = resizeCorner === 'lower-left' ? -dx : dx

            setSize({
                height: Math.max(MIN_HEIGHT, start.height + dy),
                width: Math.max(MIN_WIDTH, start.width + widthDelta),
            })
        }, { signal: controller.signal })
        window.addEventListener('pointerup', () => controller.abort(), { signal: controller.signal })
    }

    return (
        <Dialog
            onClose={onClose}
            open
            slotProps={{ paper: { style: { height: size.height, width: size.width }, sx: { m: 2, position: 'relative' } } }}
        >
            <Stack spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
                <Box>
                    <Typography variant="h6">{action.label}</Typography>
                    {action.description ? (
                        <Typography color="text.secondary" variant="body2">
                            {action.description}
                        </Typography>
                    ) : null}
                </Box>

                <Stack direction="row" spacing={1}>
                    <Button disabled={runStatus === 'running'} onClick={handleToggleSchedule} variant="outlined">
                        Schedule
                    </Button>
                    <Button disabled={runStatus === 'running'} onClick={handleRun} variant="contained">
                        Run
                    </Button>
                    <Button onClick={onClose}>Close</Button>
                </Stack>

                {scheduleOpen ? (
                    <Stack spacing={1}>
                        <TextField
                            label="Schedule trigger"
                            onChange={handleScheduleTriggerTypeChange}
                            select
                            size="small"
                            value={scheduleTriggerType}
                        >
                            <MenuItem value="at">At</MenuItem>
                            <MenuItem value="agentSlot">Agent slot</MenuItem>
                            <MenuItem value="afterAction">After action</MenuItem>
                        </TextField>
                        {scheduleTriggerType === 'at' ? (
                            <TextField
                                label="Schedule timestamp"
                                onChange={handleScheduleTimestampChange}
                                size="small"
                                type="datetime-local"
                                value={scheduleTimestamp}
                            />
                        ) : null}
                        {scheduleTriggerType === 'afterAction' ? (
                            <TextField
                                label="After action name"
                                onChange={handleScheduleAfterActionNameChange}
                                size="small"
                                value={scheduleAfterActionName}
                            />
                        ) : null}
                        <Button onClick={handleScheduleAction} size="small" variant="contained">
                            Register schedule
                        </Button>
                        {scheduleMessage ? (
                            <Typography color="text.secondary" role="status" variant="caption">
                                {scheduleMessage}
                            </Typography>
                        ) : null}
                    </Stack>
                ) : null}

                {action.type === 'agent' ? (
                    <Stack spacing={1}>
                        <TextField
                            label="Extra prompt"
                            minRows={3}
                            multiline
                            onChange={handleExtraPromptChange}
                            value={extraPrompt}
                        />
                        {extraPrompt.trim().length > 0 ? (
                            <Stack direction="row" spacing={1}>
                                <TextField
                                    label="Action label"
                                    onChange={handleActionLabelChange}
                                    size="small"
                                    value={actionLabel}
                                />
                                <Button onClick={handleConvertToAction} variant="outlined">
                                    Convert to action
                                </Button>
                            </Stack>
                        ) : null}
                        {convertMessage ? (
                            <Typography color="text.secondary" variant="caption">
                                {convertMessage}
                            </Typography>
                        ) : null}
                    </Stack>
                ) : null}

                {runStatus !== 'idle' ? (
                    <Box role="status">
                        <Typography color={statusColor(runStatus)} variant="body2">
                            {runStatus}
                        </Typography>
                        {runResult ? (
                            <Stack spacing={0.5} sx={{ mt: 1 }}>
                                {runResult.logs.map((log, index) => (
                                    <Typography key={`${log.actionName}-${log.phase}-${index}`} color="text.secondary" variant="caption">
                                        {log.phase}: {log.message}
                                    </Typography>
                                ))}
                            </Stack>
                        ) : null}
                    </Box>
                ) : null}

                <Divider />

                <Box>
                    <Typography color="text.secondary" variant="caption">
                        Run history
                    </Typography>
                    {historyError ? (
                        <Typography color="error" variant="caption">
                            {historyError}
                        </Typography>
                    ) : null}
                    {history.length > 0 ? (
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                            {history.map((entry, index) => (
                                <HistoryEntryRow entry={entry} key={`${entry.completedAt}-${entry.status}-${index}`} />
                            ))}
                        </Stack>
                    ) : (
                        <Typography color="text.secondary" variant="caption">
                            No previous runs
                        </Typography>
                    )}
                </Box>

                <RelatedActions actions={action.before} label="Before" onNavigate={onNavigate} />
                <RelatedActions actions={action.after} label="After" onNavigate={onNavigate} />
            </Stack>

            <Box
                aria-label="Resize action popup"
                data-corner={resizeCorner}
                onPointerDown={startResize}
                role="separator"
                sx={{
                    bottom: 0,
                    cursor: resizeCorner === 'lower-left' ? 'nesw-resize' : 'nwse-resize',
                    height: HANDLE_SIZE,
                    left: resizeCorner === 'lower-left' ? 0 : undefined,
                    position: 'absolute',
                    right: resizeCorner === 'lower-right' ? 0 : undefined,
                    touchAction: 'none',
                    width: HANDLE_SIZE,
                }}
            />
        </Dialog>
    )
}
