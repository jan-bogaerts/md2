import { Box, Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent, KeyboardEvent } from 'react'

interface ActionAgentPresetNameProps {
    actionLabel: string
    onActionLabelChange: (event: ChangeEvent<HTMLInputElement>) => void
    onRunShortcut?: () => void
}

/** Preset-name field shown when creating a reusable agent action. */
export function ActionAgentPresetName({ actionLabel, onActionLabelChange, onRunShortcut }: ActionAgentPresetNameProps) {
    const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter' || !onRunShortcut) return

        event.preventDefault()
        onRunShortcut()
    }

    return (
        <Stack spacing={0.75}>
            <Box sx={{ alignItems: 'baseline', display: 'flex', gap: 0.75 }}>
                <Typography color="text.secondary" sx={{ fontSize: 12, fontWeight: 600 }}>Preset name</Typography>
                <Typography color="text.disabled" sx={{ fontSize: 11.5 }}>saved for reuse</Typography>
            </Box>
            <TextField
                autoFocus
                fullWidth
                onChange={onActionLabelChange}
                onKeyDown={handleNameKeyDown}
                size="small"
                slotProps={{ htmlInput: { 'aria-label': 'Preset name' } }}
                sx={{
                    '& .MuiOutlinedInput-root': {
                        borderRadius: '9px',
                        fontSize: 13,
                        '& fieldset': { borderColor: (theme) => theme.palette.mode === 'dark' ? '#364152' : '#d5dbe3' },
                        '&:hover fieldset': { borderColor: 'text.secondary' },
                        '&.Mui-focused': { boxShadow: (theme) => `0 0 0 3px ${theme.palette.action.selected}` },
                        '&.Mui-focused fieldset': { borderColor: 'primary.main' },
                    },
                }}
                value={actionLabel}
                variant="outlined"
            />
        </Stack>
    )
}
