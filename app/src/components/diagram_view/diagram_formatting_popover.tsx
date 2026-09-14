import {
    Box, Button, Checkbox, FormControlLabel, MenuItem, Popover, TextField, Typography,
} from '@mui/material'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import {
    DIAGRAM_BORDER_STYLES,
    DIAGRAM_CONTENT_POSITIONS,
    type DiagramBorderStyle,
    type DiagramContentPosition,
    type DiagramNodeRoleFormatting,
} from '../../services/diagrams/diagram_data'
import { dialogService } from '../../services/dialog_service'

interface NodeFormattingPopoverProps {
    anchorElement: HTMLElement
    label: string
    onApply(value: DiagramNodeRoleFormatting): void
    onClose(): void
    value?: DiagramNodeRoleFormatting
}

function optionalNumber(value: string) {
    return value.trim() === '' ? undefined : Number(value)
}

function optionalString(value: string) {
    return value.trim() === '' ? undefined : value.trim()
}

function reportFormattingError(error: unknown) {
    dialogService.error(error, { fallbackMessage: 'Diagram formatting could not be applied' })
}

/** Node-role formatting draft. Apply is one service transaction; closing discards draft. */
export function NodeFormattingPopover({ anchorElement, label, onApply, onClose, value }: NodeFormattingPopoverProps) {
    const [fontFamily, setFontFamily] = useState(value?.font?.family ?? '')
    const [fontSize, setFontSize] = useState(value?.font?.size?.toString() ?? '')
    const [fontColor, setFontColor] = useState(value?.font?.color ?? '')
    const [bold, setBold] = useState(value?.font?.bold ?? false)
    const [italic, setItalic] = useState(value?.font?.italic ?? false)
    const [underline, setUnderline] = useState(value?.font?.underline ?? false)
    const [fillColor, setFillColor] = useState(value?.box?.fillColor ?? '')
    const [borderColor, setBorderColor] = useState(value?.box?.borderColor ?? '')
    const [borderStyle, setBorderStyle] = useState(value?.box?.borderStyle ?? 'solid')
    const [borderThickness, setBorderThickness] = useState(value?.box?.borderThickness?.toString() ?? '')
    const [cornerRadius, setCornerRadius] = useState(value?.box?.cornerRadius?.toString() ?? '')
    const [contentPosition, setContentPosition] = useState(value?.box?.contentPosition ?? 'center')
    const handleFontFamily = (event: ChangeEvent<HTMLInputElement>) => setFontFamily(event.target.value)
    const handleFontSize = (event: ChangeEvent<HTMLInputElement>) => setFontSize(event.target.value)
    const handleFontColor = (event: ChangeEvent<HTMLInputElement>) => setFontColor(event.target.value)
    const handleFillColor = (event: ChangeEvent<HTMLInputElement>) => setFillColor(event.target.value)
    const handleBorderColor = (event: ChangeEvent<HTMLInputElement>) => setBorderColor(event.target.value)
    const handleBorderStyle = (event: ChangeEvent<HTMLInputElement>) => setBorderStyle(event.target.value as DiagramBorderStyle)
    const handleBorderThickness = (event: ChangeEvent<HTMLInputElement>) => setBorderThickness(event.target.value)
    const handleCornerRadius = (event: ChangeEvent<HTMLInputElement>) => setCornerRadius(event.target.value)
    const handleContentPosition = (event: ChangeEvent<HTMLInputElement>) => setContentPosition(event.target.value as DiagramContentPosition)
    const handleBold = (event: ChangeEvent<HTMLInputElement>) => setBold(event.target.checked)
    const handleItalic = (event: ChangeEvent<HTMLInputElement>) => setItalic(event.target.checked)
    const handleUnderline = (event: ChangeEvent<HTMLInputElement>) => setUnderline(event.target.checked)
    const handleSubmit = (event: FormEvent) => {
        event.preventDefault()
        const formatting: DiagramNodeRoleFormatting = {
            box: {
                borderColor: optionalString(borderColor),
                borderStyle,
                borderThickness: optionalNumber(borderThickness),
                contentPosition,
                cornerRadius: optionalNumber(cornerRadius),
                fillColor: optionalString(fillColor),
            },
            font: {
                bold, color: optionalString(fontColor), family: optionalString(fontFamily), italic,
                size: optionalNumber(fontSize), underline,
            },
        }
        try {
            onApply(formatting)
            onClose()
        } catch (error) {
            reportFormattingError(error)
        }
    }

    return (
        <Popover anchorEl={anchorElement} onClose={onClose} open>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh', width: 360 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, overflowY: 'auto', p: 2 }}>
                    <Typography variant="subtitle2">Format {label} nodes</Typography>
                    <Typography color="text.secondary" variant="overline">Font</Typography>
                    <TextField autoFocus onChange={handleFontFamily} placeholder="Theme default" size="small" slotProps={{ htmlInput: { 'aria-label': 'Font family' } }} value={fontFamily} />
                    <TextField onChange={handleFontSize} placeholder="Theme default" size="small" slotProps={{ htmlInput: { 'aria-label': 'Font size', max: 200, min: 1 } }} type="number" value={fontSize} />
                    <TextField onChange={handleFontColor} placeholder="#RRGGBB" size="small" slotProps={{ htmlInput: { 'aria-label': 'Font color' } }} value={fontColor} />
                    <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                        <FormControlLabel control={<Checkbox checked={bold} onChange={handleBold} />} label="Bold" />
                        <FormControlLabel control={<Checkbox checked={italic} onChange={handleItalic} />} label="Italic" />
                        <FormControlLabel control={<Checkbox checked={underline} onChange={handleUnderline} />} label="Underline" />
                    </Box>
                    <Typography color="text.secondary" variant="overline">Box</Typography>
                    <TextField onChange={handleFillColor} placeholder="#RRGGBB" size="small" slotProps={{ htmlInput: { 'aria-label': 'Fill color' } }} value={fillColor} />
                    <TextField onChange={handleBorderColor} placeholder="#RRGGBB" size="small" slotProps={{ htmlInput: { 'aria-label': 'Border color' } }} value={borderColor} />
                    <TextField onChange={handleBorderStyle} select size="small" slotProps={{ select: { 'aria-label': 'Border style' } }} value={borderStyle}>
                        {DIAGRAM_BORDER_STYLES.map((style) => <MenuItem key={style} value={style}>{style}</MenuItem>)}
                    </TextField>
                    <TextField onChange={handleBorderThickness} size="small" slotProps={{ htmlInput: { 'aria-label': 'Border thickness', max: 20, min: 0 } }} type="number" value={borderThickness} />
                    <TextField onChange={handleCornerRadius} size="small" slotProps={{ htmlInput: { 'aria-label': 'Corner radius', max: 100, min: 0 } }} type="number" value={cornerRadius} />
                    <TextField onChange={handleContentPosition} select size="small" slotProps={{ select: { 'aria-label': 'Content position' } }} value={contentPosition}>
                        {DIAGRAM_CONTENT_POSITIONS.map((position) => <MenuItem key={position} value={position}>{position}</MenuItem>)}
                    </TextField>
                </Box>
                <Box sx={{ bgcolor: 'background.default', borderColor: 'divider', borderTop: '1px solid', display: 'flex', gap: 1, justifyContent: 'flex-end', p: 1.5 }}>
                    <Button onClick={onClose} variant="outlined">Cancel</Button>
                    <Button type="submit" variant="contained">Apply</Button>
                </Box>
            </Box>
        </Popover>
    )
}
