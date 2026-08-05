import { Box, IconButton, Popover, Stack, Tooltip, Typography } from '@mui/material'
import SourceCommit from 'mdi-material-ui/SourceCommit'
import type { MouseEvent } from 'react'
import { useState } from 'react'
import type { CommitReference } from '../../../data/electron_action_bridge'
import { CommitReferenceRow } from '../conversation/commit_reference_row'

interface ActionCommitDropdownProps {
    commits: CommitReference[]
}

/** Toolbar dropdown listing every commit produced by the action's runs. */
export function ActionCommitDropdown(props: ActionCommitDropdownProps) {
    const { commits } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorElement(event.currentTarget)
    const handleClose = () => setAnchorElement(null)

    if (commits.length === 0) return null

    return (
        <>
            <Tooltip title="Commit history">
                <IconButton aria-label="Commit history" onClick={handleOpen} size="small" sx={{ height: 26, width: 26 }}>
                    <SourceCommit sx={{ fontSize: 16 }} />
                </IconButton>
            </Tooltip>
            <Popover
                anchorEl={anchorElement}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                onClose={handleClose}
                open={!!anchorElement}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            >
                <Box sx={{ maxHeight: 360, maxWidth: 560, minWidth: 320, overflow: 'auto', px: 1.5, py: 1 }}>
                    <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 600 }} variant="caption">
                        Commits
                    </Typography>
                    <Stack spacing={0.5}>
                        {commits.map((commitReference) => (
                            <CommitReferenceRow
                                commitReference={commitReference}
                                key={`${commitReference.repositoryRoot}-${commitReference.commit}`}
                            />
                        ))}
                    </Stack>
                </Box>
            </Popover>
        </>
    )
}
