import { Box, IconButton, Tooltip, Typography } from '@mui/material'
import TrashCanOutline from 'mdi-material-ui/TrashCanOutline'
import type { WorktreeRecord } from '../../data/data_types'

interface WorktreeConfigRowProps {
    index: number
    onRemove: (index: number) => void
    record: WorktreeRecord
}

export function WorktreeConfigRow(props: WorktreeConfigRowProps) {
    const { index, onRemove, record } = props

    const handleRemove = () => {
        onRemove(index)
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
            <Tooltip title={`Unregister worktree ${index + 1}`}>
                <IconButton
                    aria-label={`Unregister worktree ${index + 1}`}
                    className="worktree-delete"
                    onClick={handleRemove}
                    size="small"
                >
                    <TrashCanOutline fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>
    )
}
