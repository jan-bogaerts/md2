import { Box, ButtonBase, Stack, TextField, Tooltip } from '@mui/material'
import type { ChangeEvent } from 'react'
import { COLOR_PICKER_PALETTE } from './color_picker_palette'

const COLOR_INPUT_SLOT_PROPS = { inputLabel: { shrink: true } }
const SWATCH_SIZE = 20

interface ColorPickerFieldProps {
    disabled?: boolean
    label: string
    name?: string
    onChange: (value: string) => void
    value: string
}

/** Colour input with a row of preset swatches, so a colour can be picked without opening the OS picker. */
export function ColorPickerField(props: ColorPickerFieldProps) {
    const { disabled = false, label, name = 'color', onChange, value } = props

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value)
    }

    return (
        <Stack spacing={1}>
            <TextField
                disabled={disabled}
                fullWidth
                label={label}
                name={name}
                onChange={handleInputChange}
                size="small"
                slotProps={COLOR_INPUT_SLOT_PROPS}
                type="color"
                value={value}
            />
            <Box aria-label={`${label} presets`} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {COLOR_PICKER_PALETTE.map((preset) => (
                    <Tooltip key={preset} title={preset}>
                        <ButtonBase
                            aria-label={`Use colour ${preset}`}
                            disabled={disabled}
                            onClick={() => onChange(preset)}
                            sx={{
                                bgcolor: preset,
                                border: 2,
                                borderColor: preset.toLowerCase() === value.toLowerCase() ? 'text.primary' : 'divider',
                                borderRadius: 0.5,
                                height: SWATCH_SIZE,
                                width: SWATCH_SIZE,
                            }}
                        />
                    </Tooltip>
                ))}
            </Box>
        </Stack>
    )
}
