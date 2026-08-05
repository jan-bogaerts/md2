import { Box, Button, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type { CommitReference } from '../../../data/electron_action_bridge'
import { DiffView } from './diff_view'

interface CommitReferenceRowProps {
    commitReference: CommitReference
}

/** One commit summary with independently toggleable diff content. */
export function CommitReferenceRow(props: CommitReferenceRowProps) {
    const { commitReference } = props
    const [showDiff, setShowDiff] = useState(false)
    const committedAt = new Date(commitReference.committedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
    const handleToggleDiff = () => setShowDiff((previous) => !previous)

    return (
        <Box sx={{ mt: 0.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Typography color="text.secondary" variant="caption">
                    {committedAt} · {commitReference.actionName} · {commitReference.commit.slice(0, 7)}
                </Typography>
                <Button onClick={handleToggleDiff} size="small">
                    {showDiff ? 'Hide diff' : 'Show diff'}
                </Button>
            </Stack>
            {showDiff ? <DiffView commitReference={commitReference} /> : null}
        </Box>
    )
}
