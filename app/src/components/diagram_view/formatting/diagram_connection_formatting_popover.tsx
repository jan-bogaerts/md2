import {
    Box, Button, FormControlLabel, MenuItem, Popover, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
    DIAGRAM_CONNECTION_MARKERS,
    type DiagramConnectionMarker,
    type DiagramConnectionKindFormatting,
    type DiagramEdgeKind,
} from '../../../services/diagrams/diagram_data';
import { dialogService } from '../../../services/dialog_service';
import { ColorPickerButton } from '../../color_picker_button';
import { FormattingGroup } from '../../formatting_group';
import { DiagramFontFamilySelect } from './diagram_font_family_select';
import { OptionalSliderField } from './optional_slider_field';

const DEFAULT_CUSTOM_FONT_SIZE = 8;
const DEFAULT_CUSTOM_LINE_THICKNESS = 1;
const HALF_WIDTH_SX = { flex: '1 1 0', minWidth: 0 };
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
    onApply(value: DiagramConnectionKindFormatting, useLabelAsDefault?: boolean): void;
    onClose(): void;
    useLabelAsDefault?: boolean;
    value?: DiagramConnectionKindFormatting;
}

function optionalString(value: string) {
    return value.trim() === '' ? undefined : value.trim();
}

/** Connection-kind formatting draft with label, line, and endpoint marker inputs. */
export function ConnectionFormattingPopover(props: ConnectionFormattingPopoverProps) {
    const { anchorElement, kind, label, onApply, onClose, useLabelAsDefault: initialUseLabelAsDefault, value } = props;
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
    const [useLabelAsDefault, setUseLabelAsDefault] = useState(initialUseLabelAsDefault ?? false);
    const handleStartMarker = (event: ChangeEvent<HTMLInputElement>) => setStartMarker(event.target.value as DiagramConnectionMarker);
    const handleEndMarker = (event: ChangeEvent<HTMLInputElement>) => setEndMarker(event.target.value as DiagramConnectionMarker);
    const handleBold = (event: ChangeEvent<HTMLInputElement>) => setBold(event.target.checked);
    const handleItalic = (event: ChangeEvent<HTMLInputElement>) => setItalic(event.target.checked);
    const handleUnderline = (event: ChangeEvent<HTMLInputElement>) => setUnderline(event.target.checked);
    const handleUseLabelAsDefault = (event: ChangeEvent<HTMLInputElement>) => setUseLabelAsDefault(event.target.checked);
    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const formatting: DiagramConnectionKindFormatting = {
            endMarker,
            font: {bold, color: fontColor, family: optionalString(fontFamily), italic, size: fontSize, underline},
            line: { color: lineColor, thickness: lineThickness },
            startMarker,
        };
        try {
            if (initialUseLabelAsDefault === undefined) onApply(formatting);
            else onApply(formatting, useLabelAsDefault);
            onClose();
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Diagram formatting could not be applied' });
        }
    };

    return (
        <Popover anchorEl={anchorElement} onClose={onClose} open>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh', width: 380 }}>
                <Box sx={{ minHeight: 0, overflowY: 'auto', p: 2 }}>
                    <Stack spacing={1}>
                        <Typography variant="subtitle2">Format {label} connections</Typography>
                        {initialUseLabelAsDefault !== undefined ? (
                            <FormControlLabel
                                control={<Switch checked={useLabelAsDefault} onChange={handleUseLabelAsDefault} />}
                                label="Use as default label"
                            />
                        ) : null}
                        <FormattingGroup id="diagram-connection-label-font" label="Label font">
                            <DiagramFontFamilySelect onChange={setFontFamily} value={fontFamily} />
                            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                <FormControlLabel control={<Switch checked={bold} onChange={handleBold} />} label="Bold" />
                                <FormControlLabel control={<Switch checked={italic} onChange={handleItalic} />} label="Italic" />
                                <FormControlLabel control={<Switch checked={underline} onChange={handleUnderline} />} label="Underline" />
                            </Stack>
                        </FormattingGroup>
                        <FormattingGroup id="diagram-connection-label-size-color" label="Label size & color">
                            <OptionalSliderField initialCustomValue={DEFAULT_CUSTOM_FONT_SIZE} label="Font size" maximum={200} minimum={1} onChange={setFontSize} unit="px" value={fontSize} />
                            <ColorPickerButton label="Font color" onChange={setFontColor} value={fontColor} />
                        </FormattingGroup>
                        <FormattingGroup id="diagram-connection-line" label="Line">
                            <ColorPickerButton label="Line color" onChange={setLineColor} value={lineColor} />
                            <OptionalSliderField initialCustomValue={DEFAULT_CUSTOM_LINE_THICKNESS} label="Line thickness" maximum={20} minimum={0} onChange={setLineThickness} unit="px" value={lineThickness} />
                        </FormattingGroup>
                        <FormattingGroup id="diagram-connection-markers" label="Markers">
                            <Stack direction="row" spacing={1}>
                                <TextField fullWidth label="Start marker" onChange={handleStartMarker} select size="small" sx={HALF_WIDTH_SX} value={startMarker}>
                                    {DIAGRAM_CONNECTION_MARKERS.map((marker) => (
                                        <MenuItem key={marker} value={marker}>{CONNECTION_MARKER_LABELS[marker]}</MenuItem>
                                    ))}
                                </TextField>
                                <TextField fullWidth label="End marker" onChange={handleEndMarker} select size="small" sx={HALF_WIDTH_SX} value={endMarker}>
                                    {DIAGRAM_CONNECTION_MARKERS.map((marker) => (
                                        <MenuItem key={marker} value={marker}>{CONNECTION_MARKER_LABELS[marker]}</MenuItem>
                                    ))}
                                </TextField>
                            </Stack>
                        </FormattingGroup>
                    </Stack>
                </Box>
                <Box sx={{ bgcolor: 'background.default', borderColor: 'divider', borderTop: '1px solid', display: 'flex', flexShrink: 0, gap: 1, justifyContent: 'flex-end', p: 1.5 }}>
                    <Button onClick={onClose} variant="outlined">Cancel</Button>
                    <Button type="submit" variant="contained">Apply</Button>
                </Box>
            </Box>
        </Popover>
    );
}
