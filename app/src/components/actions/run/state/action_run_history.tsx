import { Box, Stack, Typography } from '@mui/material'
import { useEffect, useRef } from 'react'
import type { ActionRunHistoryEntry } from '../../../../data/electron_action_bridge'
import { dialogService } from '../../../../services/dialog_service'
import { CommitReferenceRow } from '../../conversation/commit_reference_row'

interface HistoryEntryRowProps {
    entry: ActionRunHistoryEntry
}

interface ActionRunHistoryProps {
    compact?: boolean
    entries: ActionRunHistoryEntry[]
    error: string | null
}

/** One run history line with commits produced across its action chain. */
function HistoryEntryRow(props: HistoryEntryRowProps) {
    const { entry } = props
    const configuration = entry.type === 'agent'
        ? [entry.agent, entry.model, entry.thinkingLevel, entry.permissionMode].filter((value) => !!value).join(' / ')
        : ''
    const agentLabel = configuration ? ` (${configuration})` : ''
    const completedAt = new Date(entry.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
    const summary = entry.type === 'agent'
        ? `${entry.status}${agentLabel} · ${completedAt}`
        : `${entry.status}: ${entry.output}`

    return (
        <Box>
            <Typography color="text.secondary" variant="caption">
                {summary}
            </Typography>
            {entry.commits?.map((commitReference) => (
                <CommitReferenceRow
                    commitReference={commitReference}
                    key={`${commitReference.repositoryRoot}-${commitReference.commit}`}
                />
            ))}
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

    if (entries.length === 0) return null

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
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                {entries.map((entry, index) => (
                    <HistoryEntryRow entry={entry} key={`${entry.completedAt}-${entry.status}-${index}`} />
                ))}
            </Stack>
        </Box>
    )
}
