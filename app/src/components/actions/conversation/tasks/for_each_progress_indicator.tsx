import { LinearProgress, Tooltip } from '@mui/material'
import type { ActionRun } from '../../../../services/actions/action_run_registry'
import { useRunSelector } from '../../../hooks/use_action_runs'

interface ForEachProgressIndicatorProps {
    runId: string | null
}

const selectForEachProgress = (run: ActionRun | null) => run?.forEachProgress ?? null

/** Shows record-level progress for one active for-each action run. */
export function ForEachProgressIndicator({ runId }: ForEachProgressIndicatorProps) {
    const progress = useRunSelector(runId, selectForEachProgress)
    if (!progress || progress.totalCount <= 0) return null

    const { processedCount, totalCount } = progress
    const value = processedCount / totalCount * 100
    const progressDescription = `${processedCount}/${totalCount} records processed`

    return (
        <Tooltip describeChild title={progressDescription}>
            <LinearProgress
                aria-label={`For-each progress: ${processedCount} of ${totalCount} processed`}
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
