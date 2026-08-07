import { Box, IconButton, Popover, Stack, Tooltip, Typography } from '@mui/material'
import AlertCircle from 'mdi-material-ui/AlertCircle'
import type { MouseEvent } from 'react'
import { useState } from 'react'
import type { ActionRunLogEntry } from '../../../data/action_run_types'

interface ActionLogErrorDisplayProps {
    logs: ActionRunLogEntry[]
}

/** Red alert icon summarizing run-log errors; opens a popover with the error lines. */
export function ActionLogErrorDisplay(props: ActionLogErrorDisplayProps) {
    const { logs } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorElement(event.currentTarget)
    const handleClose = () => setAnchorElement(null)

    const errors = logs.filter(({ status, stderr }) => status === 'failed' || stderr.length > 0)
    if (errors.length === 0) return null

    return (
        <>
            <Tooltip title={`${errors.length} error${errors.length === 1 ? '' : 's'}`}>
                <IconButton
                    aria-label={`Show ${errors.length} error${errors.length === 1 ? '' : 's'}`}
                    onClick={handleOpen}
                    size="small"
                    sx={{ color: 'error.main', height: 26, width: 26 }}
                >
                    <AlertCircle sx={{ fontSize: 16 }} />
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
                    <Typography color="error.main" sx={{ fontSize: 12, fontWeight: 600 }} variant="caption">
                        Errors
                    </Typography>
                    <Stack spacing={0.5}>
                        {errors.map((error, index) => (
                            <Typography
                                color="error.main"
                                key={`${error.actionName}-${error.phase}-${index}`}
                                sx={{ whiteSpace: 'pre-wrap' }}
                                variant="caption"
                            >
                                {error.stderr || error.message}
                            </Typography>
                        ))}
                    </Stack>
                </Box>
            </Popover>
        </>
    )
}
