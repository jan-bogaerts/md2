import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import { Box, Button, IconButton, Popover, Stack, Tooltip, Typography } from '@mui/material'
import AlertCircle from 'mdi-material-ui/AlertCircle'
import type { MouseEvent } from 'react'
import { useState } from 'react'
import type { ActionRunLogEntry } from '../../../data/action_run_types'
import { isErrorLog } from './action_log_error_selector'

interface ActionLogErrorDisplayProps {
    logs: ActionRunLogEntry[]
}

const ESCAPE_CHARACTER = String.fromCharCode(27)
const ANSI_ESCAPE_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`, 'gu')

function cleanTechnicalOutput(value: string) {
    return value.replace(ANSI_ESCAPE_PATTERN, '').trim()
}

/** Red alert icon summarizing failed action phases; raw process output stays collapsed. */
export function ActionLogErrorDisplay(props: ActionLogErrorDisplayProps) {
    const { logs } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const [detailsExpanded, setDetailsExpanded] = useState(false)
    const handleOpen = (event: MouseEvent<HTMLElement>) => setAnchorElement(event.currentTarget)
    const handleClose = () => {
        setAnchorElement(null)
        setDetailsExpanded(false)
    }
    const handleDetailsToggle = () => setDetailsExpanded((expanded) => !expanded)

    const errors = logs.filter(isErrorLog)
    if (errors.length === 0) return null

    const failureLabel = `${errors.length} failed action${errors.length === 1 ? '' : 's'}`
    const technicalOutput = errors
        .map(({ stderr }) => cleanTechnicalOutput(stderr))
        .filter((output) => output.length > 0)
        .join('\n\n')

    return (
        <>
            <Tooltip title={failureLabel}>
                <IconButton
                    aria-label={`Show ${failureLabel}`}
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
                <Box sx={{ maxHeight: 480, maxWidth: 640, minWidth: 320, overflow: 'auto', px: 1.5, py: 1 }}>
                    <Typography color="error.main" sx={{ fontSize: 12, fontWeight: 600 }} variant="caption">
                        {failureLabel}
                    </Typography>
                    <Stack spacing={0.5}>
                        {errors.map((error, index) => (
                            <Typography
                                key={`${error.actionName}-${error.phase}-${index}`}
                                color="text.secondary"
                                variant="caption"
                            >
                                {error.actionName} ({error.phase}): {error.message}
                            </Typography>
                        ))}
                        {technicalOutput ? (
                            <>
                                <Button
                                    endIcon={detailsExpanded ? <ExpandLessOutlined /> : <ExpandMoreOutlined />}
                                    onClick={handleDetailsToggle}
                                    size="small"
                                    sx={{ alignSelf: 'flex-start' }}
                                    variant="text"
                                >
                                    {detailsExpanded ? 'Hide technical details' : 'Show technical details'}
                                </Button>
                                {detailsExpanded ? (
                                    <Box
                                        component="pre"
                                        sx={{
                                            bgcolor: 'background.default',
                                            border: '1px solid',
                                            borderColor: 'divider',
                                            borderRadius: 1,
                                            color: 'text.secondary',
                                            m: 0,
                                            maxHeight: 240,
                                            overflow: 'auto',
                                            p: 1,
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                        }}
                                    >
                                        {technicalOutput}
                                    </Box>
                                ) : null}
                            </>
                        ) : null}
                    </Stack>
                </Box>
            </Popover>
        </>
    )
}
