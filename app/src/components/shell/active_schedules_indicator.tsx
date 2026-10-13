import { Button } from '@mui/material'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import { useState, useSyncExternalStore } from 'react'
import { ActiveSchedulesDialog } from '../actions/run/schedule/active_schedules_dialog'
import { useProjectReadOnly } from '../hooks/use_project_read_only'
import { hasActiveScheduleBackend } from '../../data/electron_action_bridge'
import { activeScheduleService } from '../../services/actions/active_schedule_service'
import { dataService } from '../../services/data/data_service'

function subscribeProject(listener: () => void) {
    dataService.addEventListener('changed', listener)

    return () => dataService.removeEventListener('changed', listener)
}

function getProjectOpen() {
    return !!dataService.getState().project
}

function getActiveScheduleCount() {
    return activeScheduleService.getSnapshot().items.length
}

/** Shows the number of active schedules and opens the active schedules dialog. */
export function ActiveSchedulesIndicator() {
    const projectOpen = useSyncExternalStore(subscribeProject, getProjectOpen, getProjectOpen)
    const count = useSyncExternalStore(activeScheduleService.subscribe, getActiveScheduleCount, getActiveScheduleCount)
    const readOnly = useProjectReadOnly()
    const [open, setOpen] = useState(false)

    const handleOpen = () => setOpen(true)

    const handleClose = () => setOpen(false)

    if (!projectOpen || !hasActiveScheduleBackend()) return null

    return (
        <>
            <Button
                aria-label={`Active schedules: ${count}`}
                onClick={handleOpen}
                size="small"
                startIcon={<ScheduleOutlined sx={{ fontSize: '14px !important' }} />}
                sx={{ borderRadius: 99, color: 'text.secondary', fontSize: 11.5, height: 22, minWidth: 0, px: 1.25 }}
            >
                {count}
            </Button>
            {open ? <ActiveSchedulesDialog onClose={handleClose} open readOnly={readOnly} /> : null}
        </>
    )
}
