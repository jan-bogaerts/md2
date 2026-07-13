import { Box, Button, Stack, Typography } from '@mui/material'
import ClockOutline from 'mdi-material-ui/ClockOutline'
import { useEffect, useRef, useState } from 'react'
import type { ActionRunHistoryEntry } from '../../data/electron_action_bridge'
import { dialogService } from '../../services/dialog_service'
import { DiffView } from './diff_view'

interface HistoryEntryRowProps {
    entry: ActionRunHistoryEntry
}

interface ActionRunHistoryProps {
    compact?: boolean
    entries: ActionRunHistoryEntry[]
    error: string | null
}

/** One run history line; commit entries expose a toggleable diff view. */
function HistoryEntryRow(props: HistoryEntryRowProps) {
    const { entry } = props
    const [showDiff, setShowDiff] = useState(false)
    const agentLabel = entry.agent
        ? ` (${entry.agent}${entry.model ? ` / ${entry.model}` : ''}${entry.thinkingLevel ? ` / ${entry.thinkingLevel}` : ''})`
        : ''

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
    const { compact = false, entries, error } = props
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: compact ? 1 : 0 }}>
            <Typography color="text.secondary" sx={compact ? { fontSize: 12, fontWeight: 600 } : undefined} variant="caption">
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
            ) : compact ? (
                <Box
                    sx={{
                        alignItems: 'center',
                        border: '1.5px dashed',
                        borderColor: (theme) => theme.palette.mode === 'dark' ? '#364152' : '#d5dbe3',
                        borderRadius: '10px',
                        color: 'text.disabled',
                        display: 'flex',
                        fontSize: 12.5,
                        gap: 1,
                        justifyContent: 'center',
                        px: 1.5,
                        py: 1.75,
                    }}
                >
                    <ClockOutline sx={{ fontSize: 14 }} />
                    No previous runs
                </Box>
            ) : (
                <Typography color="text.secondary" variant="caption">
                    No previous runs
                </Typography>
            )}
        </Box>
    )
}
