import {
    Box, Button, Checkbox, FormControlLabel, MenuItem, Popover, TextField, Typography,
} from '@mui/material';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
    DIAGRAM_CONNECTION_MARKERS,
    type DiagramConnectionMarker,
    type DiagramConnectionKindFormatting,
    type DiagramEdgeKind,
} from '../../../services/diagrams/diagram_data';
import { dialogService } from '../../../services/dialog_service';
import { OptionalColorPickerField } from './optional_color_picker_field';
import { OptionalSliderField } from './optional_slider_field';

const DEFAULT_CUSTOM_FONT_SIZE = 8;
const DEFAULT_CUSTOM_LINE_THICKNESS = 1;
const CONNECTION_MARKER_LABELS: Record<DiagramConnectionMarker, string> = {
    circle: 'Circle',
    diamond: 'Diamond',
    'filled-arrow': 'Filled arrow',
    none: 'None',
    'open-arrow': 'Open arrow',
};

interface ConnectionFormattingPopoverProps {
    anchorElement: HTMLElement;
    kind: DiagramEdgeKind;
    label: string;
    onApply(value: DiagramConnectionKindFormatting): void;
    onClose(): void;
    value?: DiagramConnectionKindFormatting;
}

function optionalString(value: string) {
    return value.trim() === '' ? undefined : value.trim();
}

/** Connection-kind formatting draft with label, line, and endpoint marker inputs. */
export function ConnectionFormattingPopover(props: ConnectionFormattingPopoverProps) {
    const { anchorElement, kind, label, onApply, onClose, value } = props;
    const [fontFamily, setFontFamily] = useState(value?.font?.family ?? '');
    const [fontSize, setFontSize] = useState(value?.font?.size);
    const [fontColor, setFontColor] = useState(value?.font?.color);
    const [bold, setBold] = useState(value?.font?.bold ?? false);
    const [italic, setItalic] = useState(value?.font?.italic ?? false);
    const [underline, setUnderline] = useState(value?.font?.underline ?? false);
    const [lineColor, setLineColor] = useState(value?.line?.color);
    const [lineThickness, setLineThickness] = useState(value?.line?.thickness);
    const [startMarker, setStartMarker] = useState(value?.startMarker ?? 'none');
    const [endMarker, setEndMarker] = useState(value?.endMarker ?? (kind === 'async' ? 'open-arrow' : 'filled-arrow'));
    const handleFontFamily = (event: ChangeEvent<HTMLInputElement>) => setFontFamily(event.target.value);
    const handleStartMarker = (event: ChangeEvent<HTMLInputElement>) => setStartMarker(event.target.value as DiagramConnectionMarker);
    const handleEndMarker = (event: ChangeEvent<HTMLInputElement>) => setEndMarker(event.target.value as DiagramConnectionMarker);
    const handleBold = (event: ChangeEvent<HTMLInputElement>) => setBold(event.target.checked);
    const handleItalic = (event: ChangeEvent<HTMLInputElement>) => setItalic(event.target.checked);
    const handleUnderline = (event: ChangeEvent<HTMLInputElement>) => setUnderline(event.target.checked);
    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const formatting: DiagramConnectionKindFormatting = {
            endMarker,
            font: {bold, color: fontColor, family: optionalString(fontFamily), italic, size: fontSize, underline},
            line: { color: lineColor, thickness: lineThickness },
            startMarker,
        };
        try {
            onApply(formatting);
            onClose();
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Diagram formatting could not be applied' });
        }
    };

    return (
        <Popover anchorEl={anchorElement} onClose={onClose} open>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh', width: 380 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0, overflowY: 'auto', p: 2 }}>
                    <Typography variant="subtitle2">Format {label} connections</Typography>
                    <Typography color="text.secondary" variant="overline">Label font</Typography>
                    <TextField
                        autoFocus
                        helperText="Leave empty to use the theme font."
                        label="Font family"
                        onChange={handleFontFamily}
                        size="small"
                        value={fontFamily}
                    />
                    <OptionalSliderField
                        helperText="Choose 1-200 px, or use the theme size."
                        initialCustomValue={DEFAULT_CUSTOM_FONT_SIZE}
                        label="Font size"
                        maximum={200}
                        minimum={1}
                        onChange={setFontSize}
                        unit="px"
                        value={fontSize}
                    />
                    <OptionalColorPickerField
                        helperText="Uses the theme label color by default."
                        label="Font color"
                        onChange={setFontColor}
                        value={fontColor}
                    />
                    <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                        <FormControlLabel control={<Checkbox checked={bold} onChange={handleBold} />} label="Bold" />
                        <FormControlLabel control={<Checkbox checked={italic} onChange={handleItalic} />} label="Italic" />
                        <FormControlLabel control={<Checkbox checked={underline} onChange={handleUnderline} />} label="Underline" />
                    </Box>
                    <Typography color="text.secondary" variant="overline">Connection</Typography>
                    <OptionalColorPickerField
                        helperText="Uses the connection-kind color by default."
                        label="Line color"
                        onChange={setLineColor}
                        value={lineColor}
                    />
                    <OptionalSliderField
                        helperText="Choose 0-20 px, or use the connection-kind thickness."
                        initialCustomValue={DEFAULT_CUSTOM_LINE_THICKNESS}
                        label="Line thickness"
                        maximum={20}
                        minimum={0}
                        onChange={setLineThickness}
                        unit="px"
                        value={lineThickness}
                    />
                    <TextField
                        helperText="Marker shown where the connection starts."
                        label="Start marker"
                        onChange={handleStartMarker}
                        select
                        size="small"
                        value={startMarker}
                    >
                        {DIAGRAM_CONNECTION_MARKERS.map((marker) => (
                            <MenuItem key={marker} value={marker}>{CONNECTION_MARKER_LABELS[marker]}</MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        helperText="Marker shown where the connection ends."
                        label="End marker"
                        onChange={handleEndMarker}
                        select
                        size="small"
                        value={endMarker}
                    >
                        {DIAGRAM_CONNECTION_MARKERS.map((marker) => (
                            <MenuItem key={marker} value={marker}>{CONNECTION_MARKER_LABELS[marker]}</MenuItem>
                        ))}
                    </TextField>
                </Box>
                <Box sx={{ bgcolor: 'background.default', borderColor: 'divider', borderTop: '1px solid', display: 'flex', flexShrink: 0, gap: 1, justifyContent: 'flex-end', p: 1.5 }}>
                    <Button onClick={onClose} variant="outlined">Cancel</Button>
                    <Button type="submit" variant="contained">Apply</Button>
                </Box>
            </Box>
        </Popover>
    );
}
