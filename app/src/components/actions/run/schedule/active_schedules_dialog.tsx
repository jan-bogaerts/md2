import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Collapse,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material'
import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { AnySchedule } from '../../../../data/action_schedule_types'
import { activeScheduleService } from '../../../../services/actions/active_schedule_service'
import type { ActiveScheduleItem } from '../../../../services/actions/active_schedule_projection'
import { dialogService } from '../../../../services/dialog_service'
import { workspaceNavigationService } from '../../../../services/project/workspace_navigation_service'
import { useActiveSchedules } from '../../../hooks/use_active_schedules'

interface ActiveSchedulesDialogProps {
    onClose(): void
    open: boolean
    readOnly: boolean
}

interface ActiveScheduleRowProps {
    deleting: boolean
    expanded: boolean
    item: ActiveScheduleItem
    selected: boolean
}

function formattedTime(timestamp: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp))
}

function triggerDescription(item: ActiveScheduleItem) {
    const { trigger } = item.schedule
    if (trigger.type === 'now') return 'Now'
    if (trigger.type === 'at') return `At ${formattedTime(trigger.timestamp)}`
    if (trigger.type === 'account-reset') {
        return `${item.tracker?.label ?? `${trigger.agent} / ${trigger.limitId} / ${trigger.windowId}`} at ${formattedTime(trigger.expectedResetAt)}`
    }

    return `${item.triggerCard?.label ?? trigger.cardInternalId}: ${trigger.registrationState} to ${trigger.targetState}`
}

function ScheduleDetails({ item }: { item: ActiveScheduleItem }) {
    const { schedule } = item

    return (
        <Stack spacing={0.75} sx={{ borderTop: '1px solid', borderColor: 'divider', px: 2, py: 1.5 }}>
            <Typography color="text.secondary" variant="body2">Kind: {schedule.kind}</Typography>
            <Typography color="text.secondary" variant="body2">Action: {item.actionLabel} ({schedule.actionId})</Typography>
            <Typography color="text.secondary" variant="body2">Status: {schedule.status}</Typography>
            <Typography color="text.secondary" variant="body2">Trigger: {triggerDescription(item)}</Typography>
            <Typography color="text.secondary" variant="body2">Created: {formattedTime(schedule.createdAt)}</Typography>
            {item.target ? (
                <Typography color="text.secondary" variant="body2">
                    Current target: {item.target.label}{item.target.path ? ` (${item.target.path})` : ''}
                </Typography>
            ) : null}
            {schedule.kind === 'sequence' ? (
                <>
                    <Typography color="text.secondary" variant="body2">Ready state: {schedule.readyState}</Typography>
                    <Typography color="text.secondary" variant="body2">
                        Sequence progress: card {schedule.currentIndex + 1} of {schedule.cardInternalIds.length}
                    </Typography>
                    <Typography color="text.secondary" variant="body2">
                        Current action completed: {schedule.actionCompleted ? 'Yes' : 'No'}; ready state met: {schedule.readyStateMet ? 'Yes' : 'No'}
                    </Typography>
                    {schedule.failure ? <Typography color="error.main" variant="body2">Failure: {schedule.failure}</Typography> : null}
                </>
            ) : null}
            {item.unavailableReasons.map((reason) => (
                <Alert key={reason} severity="warning">{reason}</Alert>
            ))}
        </Stack>
    )
}

function ActiveScheduleRow(props: ActiveScheduleRowProps) {
    const { deleting, expanded, item, selected } = props
    const { schedule } = item

    const handleSelect = () => activeScheduleService.selectSchedule(schedule.id)
    const handleOpen = () => {
        activeScheduleService.selectSchedule(schedule.id)
        if (item.target) workspaceNavigationService.openCard(item.target.id)
    }
    const handleToggleExpanded = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        activeScheduleService.toggleExpanded(schedule.id)
    }
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return

        event.preventDefault()
        handleSelect()
    }

    return (
        <Box
            aria-label={`${item.actionLabel} ${schedule.kind} schedule`}
            aria-selected={selected}
            onClick={handleSelect}
            onDoubleClick={handleOpen}
            onKeyDown={handleKeyDown}
            role="option"
            sx={{
                bgcolor: selected ? 'custom.primaryBg' : 'background.paper',
                border: '1px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                borderRadius: 1.25,
                cursor: 'pointer',
                opacity: deleting ? 0.6 : 1,
                overflow: 'hidden',
                '&:hover': { bgcolor: selected ? 'custom.primaryBg' : 'custom.track', borderColor: 'custom.borderHover' },
                '&:focus-within': { borderColor: 'primary.main' },
            }}
            tabIndex={0}
        >
            <Box sx={{ alignItems: 'center', display: 'flex', gap: 1, minWidth: 0, px: 2, py: 1.25 }}>
                <ScheduleOutlined color={schedule.status === 'running' ? 'success' : 'action'} sx={{ flexShrink: 0, fontSize: 18 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap variant="subtitle2">{item.actionLabel}</Typography>
                    <Typography color="custom.text3" noWrap variant="caption">
                        {schedule.kind} · {schedule.status} · {triggerDescription(item)}
                    </Typography>
                </Box>
                <Tooltip title={expanded ? 'Collapse schedule details' : 'Expand schedule details'}>
                    <IconButton
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${item.actionLabel} schedule details`}
                        onClick={handleToggleExpanded}
                        size="small"
                    >
                        {expanded ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
                    </IconButton>
                </Tooltip>
            </Box>
            <Collapse in={expanded}>
                <ScheduleDetails item={item} />
            </Collapse>
        </Box>
    )
}

function deleteConfirmationMessage(schedule: AnySchedule) {
    if (schedule.status === 'running') return 'Delete this schedule? Its current action will be cancelled.'

    return 'Delete this schedule?'
}

/** Lists backend-owned active schedules and sends management commands through Electron. */
export function ActiveSchedulesDialog({ onClose, open, readOnly }: ActiveSchedulesDialogProps) {
    const snapshot = useActiveSchedules()
    const [confirmationItem, setConfirmationItem] = useState<ActiveScheduleItem | null>(null)
    const selectedItem = snapshot.items.find(({ schedule }) => schedule.id === snapshot.selectedScheduleId) ?? null
    const selectedDeleting = selectedItem ? snapshot.deletingScheduleIds.includes(selectedItem.schedule.id) : false
    const confirmationDeleting = confirmationItem
        ? snapshot.deletingScheduleIds.includes(confirmationItem.schedule.id)
        : false

    const handleOpen = () => {
        if (selectedItem?.target) workspaceNavigationService.openCard(selectedItem.target.id)
    }
    const handleRequestDelete = () => {
        if (selectedItem) setConfirmationItem(selectedItem)
    }
    const handleCancelDelete = () => setConfirmationItem(null)
    const handleConfirmDelete = async () => {
        if (!confirmationItem) return
        try {
            await activeScheduleService.deleteSchedule(confirmationItem.schedule.id)
            setConfirmationItem(null)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Schedule could not be deleted' })
        }
    }

    return (
        <>
            <Dialog fullWidth maxWidth="md" onClose={onClose} open={open}>
                <DialogTitle>Active schedules</DialogTitle>
                <DialogContent dividers sx={{ minHeight: 260, overflowY: 'auto' }}>
                    {snapshot.error ? <Alert severity="error" sx={{ mb: 2 }}>{snapshot.error}</Alert> : null}
                    {snapshot.loading && snapshot.items.length === 0 ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress aria-label="Loading active schedules" /></Box>
                    ) : null}
                    {!snapshot.loading && snapshot.items.length === 0 ? (
                        <Box sx={{ alignItems: 'center', border: '1.5px dashed', borderColor: 'custom.borderStrong', borderRadius: 1.25, display: 'flex', flexDirection: 'column', gap: 1, justifyContent: 'center', py: 6 }}>
                            <ScheduleOutlined sx={{ color: 'custom.text4' }} />
                            <Typography color="custom.text4">No active schedules</Typography>
                        </Box>
                    ) : (
                        <Stack aria-label="Active schedules" role="listbox" spacing={1}>
                            {snapshot.items.map((item) => (
                                <ActiveScheduleRow
                                    deleting={snapshot.deletingScheduleIds.includes(item.schedule.id)}
                                    expanded={snapshot.expandedScheduleIds.includes(item.schedule.id)}
                                    item={item}
                                    key={item.schedule.id}
                                    selected={snapshot.selectedScheduleId === item.schedule.id}
                                />
                            ))}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider' }}>
                    <Button onClick={onClose} variant="outlined">Close</Button>
                    <Button color="error" disabled={!selectedItem || selectedDeleting || readOnly} onClick={handleRequestDelete} variant="outlined">Delete</Button>
                    <Button disabled={!selectedItem?.target?.available || selectedDeleting} onClick={handleOpen} variant="contained">Open</Button>
                </DialogActions>
            </Dialog>
            <Dialog aria-labelledby="delete-schedule-title" onClose={handleCancelDelete} open={!!confirmationItem}>
                <DialogTitle id="delete-schedule-title">Delete schedule</DialogTitle>
                <DialogContent>
                    <Typography>{confirmationItem ? deleteConfirmationMessage(confirmationItem.schedule) : ''}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button disabled={confirmationDeleting} onClick={handleCancelDelete} variant="outlined">Cancel</Button>
                    <Button color="error" disabled={confirmationDeleting} onClick={handleConfirmDelete} variant="contained">Delete</Button>
                </DialogActions>
            </Dialog>
        </>
    )
}
