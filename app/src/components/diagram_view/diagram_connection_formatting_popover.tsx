import {
    Box, Button, Checkbox, FormControlLabel, MenuItem, Popover, TextField, Typography,
} from '@mui/material'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import {
    DIAGRAM_CONNECTION_MARKERS,
    type DiagramConnectionMarker,
    type DiagramConnectionKindFormatting,
    type DiagramEdgeKind,
} from '../../services/diagrams/diagram_data'
import { dialogService } from '../../services/dialog_service'

interface ConnectionFormattingPopoverProps {
    anchorElement: HTMLElement
    kind: DiagramEdgeKind
    label: string
    onApply(value: DiagramConnectionKindFormatting): void
    onClose(): void
    value?: DiagramConnectionKindFormatting
}

function optionalNumber(value: string) {
    return value.trim() === '' ? undefined : Number(value)
}

function optionalString(value: string) {
    return value.trim() === '' ? undefined : value.trim()
}

/** Connection-kind formatting draft with label, line, and endpoint marker inputs. */
export function ConnectionFormattingPopover({ anchorElement, kind, label, onApply, onClose, value }: ConnectionFormattingPopoverProps) {
    const [fontFamily, setFontFamily] = useState(value?.font?.family ?? '')
    const [fontSize, setFontSize] = useState(value?.font?.size?.toString() ?? '')
    const [fontColor, setFontColor] = useState(value?.font?.color ?? '')
    const [bold, setBold] = useState(value?.font?.bold ?? false)
    const [italic, setItalic] = useState(value?.font?.italic ?? false)
    const [underline, setUnderline] = useState(value?.font?.underline ?? false)
    const [lineColor, setLineColor] = useState(value?.line?.color ?? '')
    const [lineThickness, setLineThickness] = useState(value?.line?.thickness?.toString() ?? '')
    const [startMarker, setStartMarker] = useState(value?.startMarker ?? 'none')
    const [endMarker, setEndMarker] = useState(value?.endMarker ?? (kind === 'async' ? 'open-arrow' : 'filled-arrow'))
    const handleFontFamily = (event: ChangeEvent<HTMLInputElement>) => setFontFamily(event.target.value)
    const handleFontSize = (event: ChangeEvent<HTMLInputElement>) => setFontSize(event.target.value)
    const handleFontColor = (event: ChangeEvent<HTMLInputElement>) => setFontColor(event.target.value)
    const handleLineColor = (event: ChangeEvent<HTMLInputElement>) => setLineColor(event.target.value)
    const handleLineThickness = (event: ChangeEvent<HTMLInputElement>) => setLineThickness(event.target.value)
    const handleStartMarker = (event: ChangeEvent<HTMLInputElement>) => setStartMarker(event.target.value as DiagramConnectionMarker)
    const handleEndMarker = (event: ChangeEvent<HTMLInputElement>) => setEndMarker(event.target.value as DiagramConnectionMarker)
    const handleBold = (event: ChangeEvent<HTMLInputElement>) => setBold(event.target.checked)
    const handleItalic = (event: ChangeEvent<HTMLInputElement>) => setItalic(event.target.checked)
    const handleUnderline = (event: ChangeEvent<HTMLInputElement>) => setUnderline(event.target.checked)
    const handleSubmit = (event: FormEvent) => {
        event.preventDefault()
        const formatting: DiagramConnectionKindFormatting = {
            endMarker,
            font: {
                bold, color: optionalString(fontColor), family: optionalString(fontFamily), italic,
                size: optionalNumber(fontSize), underline,
            },
            line: { color: optionalString(lineColor), thickness: optionalNumber(lineThickness) },
            startMarker,
        }
        try {
            onApply(formatting)
            onClose()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Diagram formatting could not be applied' })
        }
    }

    return (
        <Popover anchorEl={anchorElement} onClose={onClose} open>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh', width: 360 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, overflowY: 'auto', p: 2 }}>
                    <Typography variant="subtitle2">Format {label} connections</Typography>
                    <Typography color="text.secondary" variant="overline">Label font</Typography>
                    <TextField autoFocus onChange={handleFontFamily} placeholder="Theme default" size="small" slotProps={{ htmlInput: { 'aria-label': 'Font family' } }} value={fontFamily} />
                    <TextField onChange={handleFontSize} placeholder="Theme default" size="small" slotProps={{ htmlInput: { 'aria-label': 'Font size', max: 200, min: 1 } }} type="number" value={fontSize} />
                    <TextField onChange={handleFontColor} placeholder="#RRGGBB" size="small" slotProps={{ htmlInput: { 'aria-label': 'Font color' } }} value={fontColor} />
                    <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                        <FormControlLabel control={<Checkbox checked={bold} onChange={handleBold} />} label="Bold" />
                        <FormControlLabel control={<Checkbox checked={italic} onChange={handleItalic} />} label="Italic" />
                        <FormControlLabel control={<Checkbox checked={underline} onChange={handleUnderline} />} label="Underline" />
                    </Box>
                    <Typography color="text.secondary" variant="overline">Connection</Typography>
                    <TextField onChange={handleLineColor} placeholder="#RRGGBB" size="small" slotProps={{ htmlInput: { 'aria-label': 'Line color' } }} value={lineColor} />
                    <TextField onChange={handleLineThickness} size="small" slotProps={{ htmlInput: { 'aria-label': 'Line thickness', max: 20, min: 0 } }} type="number" value={lineThickness} />
                    <TextField onChange={handleStartMarker} select size="small" slotProps={{ select: { 'aria-label': 'Start marker' } }} value={startMarker}>
                        {DIAGRAM_CONNECTION_MARKERS.map((marker) => <MenuItem key={marker} value={marker}>{marker}</MenuItem>)}
                    </TextField>
                    <TextField onChange={handleEndMarker} select size="small" slotProps={{ select: { 'aria-label': 'End marker' } }} value={endMarker}>
                        {DIAGRAM_CONNECTION_MARKERS.map((marker) => <MenuItem key={marker} value={marker}>{marker}</MenuItem>)}
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
