import { Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import type { ActionRunHistoryEntry } from '../../data/electron_action_bridge'
import { dialogService } from '../../services/dialog_service'
import { DiffView } from './diff_view'

interface HistoryEntryRowProps {
    entry: ActionRunHistoryEntry
}

interface ActionRunHistoryProps {
    entries: ActionRunHistoryEntry[]
    error: string | null
}

/** One run history line; commit entries expose a toggleable diff view. */
function HistoryEntryRow(props: HistoryEntryRowProps) {
    const { entry } = props
    const [showDiff, setShowDiff] = useState(false)
    const agentLabel = entry.agent ? ` (${entry.agent}${entry.model ? ` / ${entry.model}` : ''})` : ''

    const handleToggleDiff = () => setShowDiff((previous) => !previous)

    return (
        <Box>
            <Typography color="text.secondary" variant="caption">
                {entry.status}{agentLabel}: {entry.output || entry.prompt}
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

/** Presentation-only list of previous action runs. */
export function ActionRunHistory(props: ActionRunHistoryProps) {
    const { entries, error } = props
    const reportedErrorRef = useRef<string | null>(null)

    useEffect(() => {
        if (!error) {
            reportedErrorRef.current = null

            return
        }

        if (error === reportedErrorRef.current) return

        dialogService.error(error)
        reportedErrorRef.current = error
    }, [error])

    return (
        <Box>
            <Typography color="text.secondary" variant="caption">
                Run history
            </Typography>
            {error ? (
                <Typography color="text.secondary" variant="caption">
                    Run history unavailable.
                </Typography>
            ) : null}
            {entries.length > 0 ? (
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {entries.map((entry, index) => (
                        <HistoryEntryRow entry={entry} key={`${entry.completedAt}-${entry.status}-${index}`} />
                    ))}
                </Stack>
            ) : (
                <Typography color="text.secondary" variant="caption">
                    No previous runs
                </Typography>
            )}
        </Box>
    )
}
