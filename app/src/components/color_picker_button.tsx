import FormatColorResetOutlined from '@mui/icons-material/FormatColorResetOutlined'
import { Box, ButtonBase, Popover, Tooltip, Typography } from '@mui/material'
import { useState, type MouseEvent } from 'react'
import { ColorPickerField } from './color_picker_field'

const BUTTON_HEIGHT = 40
const DEFAULT_ICON_SIZE = 18
const PICKER_WIDTH = 260

interface ColorPickerButtonProps {
    label: string
    onChange: (value: string | undefined) => void
    /** Preset swatches; defaults to the picker's standard palette. */
    palette?: readonly string[]
    /** `undefined` means the default colour is selected. */
    value: string | undefined
}

/** Compact colour control: a box showing the current colour that opens the colour picker, including a Default box. */
export function ColorPickerButton(props: ColorPickerButtonProps) {
    const { label, onChange, palette, value } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const isDefault = value === undefined

    const handleOpen = (event: MouseEvent<HTMLElement>) => {
        setAnchorElement(event.currentTarget)
    }

    const handleClose = () => {
        setAnchorElement(null)
    }

    return (
        <>
            <Tooltip title={`${label}: ${value ?? 'Default'}`}>
                <ButtonBase
                    aria-label={label}
                    onClick={handleOpen}
                    sx={{
                        bgcolor: value,
                        border: 1,
                        borderColor: 'custom.borderStrong',
                        borderRadius: 1,
                        color: 'text.secondary',
                        gap: 1,
                        height: BUTTON_HEIGHT,
                        width: '100%',
                    }}
                >
                    {isDefault ? (
                        <>
                            <FormatColorResetOutlined sx={{ fontSize: DEFAULT_ICON_SIZE }} />
                            <Typography variant="body2">Default</Typography>
                        </>
                    ) : null}
                </ButtonBase>
            </Tooltip>
            <Popover anchorEl={anchorElement} onClose={handleClose} open={!!anchorElement}>
                <Box sx={{ p: 1, width: PICKER_WIDTH }}>
                    <ColorPickerField label={label} onChange={onChange} palette={palette} showDefault value={value} />
                </Box>
            </Popover>
        </>
    )
}
