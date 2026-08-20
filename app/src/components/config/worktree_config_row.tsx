import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import TrashCanOutline from 'mdi-material-ui/TrashCanOutline'
import type { WorktreeRecord } from '../../data/data_types'

interface WorktreeConfigRowProps {
    disabled: boolean
    index: number
    onRemove: (path: string, pendingAddition: boolean) => void
    pendingAddition?: boolean
    pendingRemoval?: boolean
    record: Pick<WorktreeRecord, 'error' | 'path' | 'valid'>
}

export function WorktreeConfigRow(props: WorktreeConfigRowProps) {
    const { disabled, index, onRemove, pendingAddition = false, pendingRemoval = false, record } = props

    const handleRemove = () => {
        onRemove(record.path, pendingAddition)
    }

    return (
        <Box
            sx={{
                alignItems: 'center',
                border: 1,
                borderColor: record.valid ? 'divider' : 'error.main',
                borderRadius: 1,
                display: 'flex',
                gap: 1,
                minHeight: 42,
                px: 1.5,
                '& .worktree-delete': { opacity: 0 },
                '&:focus-within .worktree-delete, &:hover .worktree-delete': { opacity: 1 },
            }}
        >
            <Typography sx={{ flexShrink: 0, fontWeight: 700 }}>{index + 1}</Typography>
            <Tooltip title={record.error ?? record.path}>
                <Typography color={record.valid ? 'text.primary' : 'error'} noWrap sx={{ flex: 1 }}>
                    {record.path}
                </Typography>
            </Tooltip>
            {pendingAddition ? <Typography color="text.secondary" variant="caption">Pending addition</Typography> : null}
            {pendingRemoval ? <Typography color="text.secondary" variant="caption">Pending removal</Typography> : null}
            <Tooltip title={`Remove worktree ${index + 1}`}>
                <IconButton
                    aria-label={`Remove worktree ${index + 1}`}
                    className="worktree-delete"
                    disabled={disabled || pendingRemoval}
                    onClick={handleRemove}
                    size="small"
                >
                    <TrashCanOutline fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>
    )
}
