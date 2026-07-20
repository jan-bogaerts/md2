import { Badge, Box, IconButton, Popover, Stack, Tooltip, Typography } from '@mui/material'
import SourceCommit from 'mdi-material-ui/SourceCommit'
import type { MouseEvent } from 'react'
import { useState } from 'react'
import type { CardCommit } from '../../services/actions/card_commit_history'

interface CardCommitMenuProps {
    commits: CardCommit[]
    error: Error | null
    onSelect: (commit: CardCommit) => void
}

function commitDate(timestamp: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(timestamp))
}

/** Commit-history menu shared by board-card and file-card surfaces. */
export function CardCommitMenu(props: CardCommitMenuProps) {
    const { commits, error, onSelect } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorElement(event.currentTarget)
    const handleClose = () => setAnchorElement(null)
    const selectCommit = (event: MouseEvent<HTMLButtonElement>) => {
        const commitKey = event.currentTarget.dataset.commitKey
        const commit = commits.find(({ record }) => record.executionId === commitKey)
        if (!commit) throw new Error(`Card commit menu selection not found: ${commitKey}`)
        onSelect(commit)
        handleClose()
    }

    if (error) {
        return <Typography color="error" role="alert" title={error.message} variant="caption">Commit history unavailable</Typography>
    }
    if (commits.length === 0) return null

    return (
        <>
            <Tooltip title="Card commit history">
                <IconButton aria-label="Card commit history" onClick={handleOpen} size="small" sx={{ height: 30, width: 30 }}>
                    <Badge badgeContent={commits.length > 1 ? commits.length : 0} color="primary">
                        <SourceCommit sx={{ fontSize: 17 }} />
                    </Badge>
                </IconButton>
            </Tooltip>
            <Popover anchorEl={anchorElement} onClose={handleClose} open={!!anchorElement}>
                <Stack sx={{ maxHeight: 360, minWidth: 340, overflowY: 'auto', p: 1 }}>
                    {commits.map((commit) => (
                        <Box
                            component="button"
                            data-commit-key={commit.record.executionId}
                            key={`${commit.record.executionId}:${commit.commit}`}
                            onClick={selectCommit}
                            title={commit.commit}
                            sx={{
                                '&:hover': { bgcolor: 'action.hover' },
                                background: 'none',
                                border: 0,
                                borderRadius: 1,
                                color: 'text.primary',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                p: 1,
                                textAlign: 'left',
                            }}
                            type="button"
                        >
                            <Typography variant="body2">{commit.record.rootActionLabel} · {commitDate(commit.committedAt)}</Typography>
                            <Typography color="text.secondary" variant="caption">
                                {commit.commit.slice(0, 7)} · +{commit.insertions}/−{commit.deletions}
                            </Typography>
                        </Box>
                    ))}
                </Stack>
            </Popover>
        </>
    )
}
