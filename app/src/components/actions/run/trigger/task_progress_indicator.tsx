import { LinearProgress, Tooltip } from '@mui/material'
import type { ActionRun } from '../../../../services/actions/action_run_registry'
import { useRunSelector } from '../../../hooks/use_action_runs'

interface TaskProgressIndicatorProps {
    runId: string
}

const selectTaskList = (run: ActionRun | null) => run?.conversation?.taskList

/** Shows task completion for one live action run. */
export function TaskProgressIndicator({ runId }: TaskProgressIndicatorProps) {
    const taskList = useRunSelector(runId, selectTaskList)

    if (!taskList || taskList.tasks.length === 0) return null

    const completedCount = taskList.tasks.filter(({ status }) => status === 'completed').length
    const totalCount = taskList.tasks.length
    const value = completedCount / totalCount * 100
    const progressDescription = `${completedCount}/${totalCount} tasks completed`

    return (
        <Tooltip describeChild title={progressDescription}>
            <LinearProgress
                aria-label={`Task progress: ${completedCount} of ${totalCount} completed`}
                sx={{
                    '& .MuiLinearProgress-bar': { bgcolor: 'primary.main' },
                    bgcolor: 'custom.track',
                    borderRadius: 1,
                    height: (theme) => theme.spacing(0.5),
                    width: '100%',
                }}
                value={value}
                variant="determinate"
            />
        </Tooltip>
    )
}
