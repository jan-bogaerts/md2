import { Box, MenuItem, Select, Stack, Typography } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import { defaultColumnAccent, type StateConfig } from '../../../data/data_types'

interface NewCardColumnPickerProps {
    isMobile: boolean
    onChange: (status: string) => void
    selectedStatus: string
    states: StateConfig[]
}

/** Selects target board column for newly created card. */
export function NewCardColumnPicker(props: NewCardColumnPickerProps) {
    const { isMobile, onChange, selectedStatus, states } = props
    const selectedIndex = states.findIndex((stateConfig) => stateConfig.state === selectedStatus)
    const selectedState = states[selectedIndex]

    const handleChange = (event: SelectChangeEvent) => {
        onChange(event.target.value)
    }

    return (
        <Select
            aria-label="Target column"
            onChange={handleChange}
            renderValue={() => (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Typography color="custom.text3" sx={{ fontSize: isMobile ? 13 : 12 }}>
                        Add to
                    </Typography>
                    <Box
                        aria-hidden
                        sx={{
                            bgcolor: selectedState?.color ?? (selectedIndex >= 0 ? defaultColumnAccent(selectedIndex) : 'custom.text4'),
                            borderRadius: '50%',
                            height: 8,
                            width: 8,
                        }}
                    />
                    <Typography color="text.primary" sx={{ fontSize: isMobile ? 13.5 : 12.5, fontWeight: 600 }}>
                        {selectedState?.state}
                    </Typography>
                </Stack>
            )}
            size="small"
            sx={{
                bgcolor: isMobile ? 'background.paper' : 'transparent',
                borderRadius: isMobile ? '11px' : '9px',
                flex: isMobile ? 1 : undefined,
                height: isMobile ? 44 : 36,
                minWidth: isMobile ? 0 : 180,
                width: isMobile ? '100%' : undefined,
                '&.Mui-focused': { boxShadow: (theme) => `0 0 0 3px ${theme.palette.custom.primaryBg}` },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main', borderWidth: 1 },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
            }}
            value={selectedStatus}
        >
            {states.map((stateConfig, index) => (
                <MenuItem key={stateConfig.state} value={stateConfig.state}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Box
                            aria-hidden
                            sx={{
                                bgcolor: stateConfig.color ?? defaultColumnAccent(index),
                                borderRadius: '50%',
                                height: 8,
                                width: 8,
                            }}
                        />
                        <span>{stateConfig.state}</span>
                    </Stack>
                </MenuItem>
            ))}
        </Select>
    )
}
