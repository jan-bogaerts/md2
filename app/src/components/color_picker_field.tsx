import FormatColorResetOutlined from '@mui/icons-material/FormatColorResetOutlined'
import { Box, ButtonBase, Stack, TextField, Tooltip } from '@mui/material'
import type { ChangeEvent } from 'react'
import { COLOR_PICKER_PALETTE } from './color_picker_palette'

const COLOR_INPUT_SLOT_PROPS = { inputLabel: { shrink: true } }
const SWATCH_SIZE = 20
const DEFAULT_ICON_SIZE = 14

interface ColorPickerFieldBaseProps {
    disabled?: boolean
    label: string
    name?: string
    /** Preset swatches; defaults to `COLOR_PICKER_PALETTE`. */
    palette?: readonly string[]
}

interface RequiredColorPickerFieldProps extends ColorPickerFieldBaseProps {
    onChange: (value: string) => void
    showDefault?: false
    value: string
}

interface DefaultableColorPickerFieldProps extends ColorPickerFieldBaseProps {
    onChange: (value: string | undefined) => void
    showDefault: true
    /** `undefined` means the default colour is selected. */
    value: string | undefined
}

type ColorPickerFieldProps = RequiredColorPickerFieldProps | DefaultableColorPickerFieldProps

/**
 * Colour input with a row of preset swatches, so a colour can be picked without opening the OS picker.
 * With `showDefault`, the row starts with a Default box that reports `undefined`.
 */
export function ColorPickerField(props: ColorPickerFieldProps) {
    const { disabled = false, label, name = 'color', onChange, palette = COLOR_PICKER_PALETTE, value } = props
    const isDefault = value === undefined

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.value)
    }

    const handleDefaultClick = () => {
        if (!props.showDefault) return

        props.onChange(undefined)
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
                value={value ?? ''}
            />
            <Box aria-label={`${label} presets`} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {props.showDefault ? (
                    <Tooltip title="Default">
                        <ButtonBase
                            aria-label="Use default colour"
                            aria-pressed={isDefault}
                            disabled={disabled}
                            onClick={handleDefaultClick}
                            sx={{
                                border: 2,
                                borderColor: isDefault ? 'text.primary' : 'divider',
                                borderRadius: 0.5,
                                color: 'text.secondary',
                                height: SWATCH_SIZE,
                                width: SWATCH_SIZE,
                            }}
                        >
                            <FormatColorResetOutlined sx={{ fontSize: DEFAULT_ICON_SIZE }} />
                        </ButtonBase>
                    </Tooltip>
                ) : null}
                {palette.map((preset) => (
                    <Tooltip key={preset} title={preset}>
                        <ButtonBase
                            aria-label={`Use colour ${preset}`}
                            disabled={disabled}
                            onClick={() => onChange(preset)}
                            sx={{
                                bgcolor: preset,
                                border: 2,
                                borderColor: preset.toLowerCase() === value?.toLowerCase() ? 'text.primary' : 'divider',
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
