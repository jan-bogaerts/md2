import {
    Button,
    FormControl,
    FormControlLabel,
    MenuItem,
    Radio,
    RadioGroup,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material'
import type { ChangeEvent } from 'react'
import type { ActionScheduleAccountTracker, ActionScheduleCardOption } from './action_schedule_options'
import type { ActionScheduleSnapshot, ActionScheduleTriggerType } from './action_schedule_store'

export type ActionScheduleFormChange =
    | { agent: string; type: 'agent' }
    | { cardInternalId: string; type: 'card' }
    | { limitId: string; type: 'tracker'; windowId: string }
    | { targetState: string; type: 'target-state' }
    | { timestamp: string; type: 'timestamp' }
    | { triggerType: ActionScheduleTriggerType; type: 'trigger-type' }

interface ActionScheduleFormProps {
    accountTrackers: ActionScheduleAccountTracker[]
    canRegister: boolean
    cards: ActionScheduleCardOption[]
    message: string | null
    onChange(change: ActionScheduleFormChange): void
    onRegister(): void
    snapshot: ActionScheduleSnapshot
    targetStates: string[]
}

const AGENTS = [
    { label: 'Claude', value: 'claude' },
    { label: 'Codex', value: 'codex' },
]

function trackerValue(limitId: string, windowId: string) {
    return JSON.stringify([limitId, windowId])
}

function formattedReset(timestamp: string | null) {
    if (!timestamp) return 'reset unavailable'

    return `resets ${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))}`
}

/** Trigger selection and trigger-specific schedule fields. */
export function ActionScheduleForm(props: ActionScheduleFormProps) {
    const { accountTrackers, canRegister, cards, message, onChange, onRegister, snapshot, targetStates } = props
    const selectedAgentTrackers = snapshot.triggerType === 'account-reset'
        ? accountTrackers.filter(({ agent }) => agent === snapshot.agent)
        : []
    const selectedTrackerValue = snapshot.triggerType === 'account-reset' && snapshot.limitId && snapshot.windowId
        ? trackerValue(snapshot.limitId, snapshot.windowId)
        : ''

    const handleTriggerTypeChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ triggerType: event.target.value as ActionScheduleTriggerType, type: 'trigger-type' })
    }
    const handleTimestampChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange({ timestamp: event.target.value, type: 'timestamp' })
    }
    const handleAgentChange = (event: { target: { value: unknown } }) => {
        onChange({ agent: event.target.value as string, type: 'agent' })
    }
    const handleTrackerChange = (event: { target: { value: unknown } }) => {
        const [limitId, windowId] = JSON.parse(event.target.value as string) as [string, string]
        onChange({ limitId, type: 'tracker', windowId })
    }
    const handleCardChange = (event: { target: { value: unknown } }) => {
        onChange({ cardInternalId: event.target.value as string, type: 'card' })
    }
    const handleTargetStateChange = (event: { target: { value: unknown } }) => {
        onChange({ targetState: event.target.value as string, type: 'target-state' })
    }

    return (
        <Stack spacing={1.5}>
            <FormControl component="fieldset">
                <Typography color="text.secondary" component="legend" variant="caption">Schedule trigger</Typography>
                <RadioGroup onChange={handleTriggerTypeChange} value={snapshot.triggerType}>
                    <FormControlLabel control={<Radio size="small" />} label="Set date and time" value="at" />
                    <FormControlLabel control={<Radio size="small" />} label="When account usage resets" value="account-reset" />
                    <FormControlLabel control={<Radio size="small" />} label="When another card enters state" value="card-state" />
                </RadioGroup>
            </FormControl>
            {snapshot.triggerType === 'at' ? (
                <Stack spacing={0.75}>
                    <Typography color="text.secondary" component="label" htmlFor="action-schedule-timestamp" variant="caption">
                        Date and time
                    </Typography>
                    <TextField
                        autoFocus
                        id="action-schedule-timestamp"
                        onChange={handleTimestampChange}
                        required
                        size="small"
                        type="datetime-local"
                        value={snapshot.timestamp}
                    />
                </Stack>
            ) : null}
            {snapshot.triggerType === 'account-reset' ? (
                <Stack spacing={1}>
                    <Typography color="text.secondary" id="action-schedule-agent-label" variant="caption">Agent</Typography>
                    <Select
                        inputProps={{ 'aria-label': 'Agent' }}
                        onChange={handleAgentChange}
                        size="small"
                        value={snapshot.agent}
                    >
                        {AGENTS.map(({ label, value }) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                    </Select>
                    {snapshot.agent ? (
                        <>
                            <Typography color="text.secondary" id="action-schedule-tracker-label" variant="caption">Limit and window</Typography>
                            <Select
                                displayEmpty
                                inputProps={{ 'aria-label': 'Limit and window' }}
                                onChange={handleTrackerChange}
                                size="small"
                                value={selectedTrackerValue}
                            >
                                {selectedAgentTrackers.length === 0 ? (
                                    <MenuItem disabled value="">No current account trackers</MenuItem>
                                ) : null}
                                {selectedAgentTrackers.map((tracker) => (
                                    <MenuItem
                                        key={trackerValue(tracker.limitId, tracker.windowId)}
                                        value={trackerValue(tracker.limitId, tracker.windowId)}
                                    >
                                        {tracker.label} · {formattedReset(tracker.expectedResetAt)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </>
                    ) : null}
                </Stack>
            ) : null}
            {snapshot.triggerType === 'card-state' ? (
                <Stack spacing={1}>
                    <Typography color="text.secondary" id="action-schedule-card-label" variant="caption">Card</Typography>
                    <Select
                        displayEmpty
                        inputProps={{ 'aria-label': 'Card' }}
                        onChange={handleCardChange}
                        size="small"
                        value={snapshot.cardInternalId}
                    >
                        {cards.length === 0 ? <MenuItem disabled value="">No other active cards</MenuItem> : null}
                        {cards.map((card) => (
                            <MenuItem key={card.cardInternalId} value={card.cardInternalId}>{card.label}</MenuItem>
                        ))}
                    </Select>
                    <Typography color="text.secondary" id="action-schedule-target-state-label" variant="caption">Target state</Typography>
                    <Select
                        displayEmpty
                        inputProps={{ 'aria-label': 'Target state' }}
                        onChange={handleTargetStateChange}
                        size="small"
                        value={snapshot.targetState}
                    >
                        {targetStates.length === 0 ? <MenuItem disabled value="">No configured states</MenuItem> : null}
                        {targetStates.map((state) => <MenuItem key={state} value={state}>{state}</MenuItem>)}
                    </Select>
                </Stack>
            ) : null}
            <Button disabled={!canRegister} onClick={onRegister} size="small" variant="contained">
                Schedule action
            </Button>
            {message ? <Typography color="text.secondary" role="status" variant="caption">{message}</Typography> : null}
        </Stack>
    )
}
