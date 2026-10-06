import {
    Box, Button, FormControlLabel, MenuItem, Popover, Stack, Switch, TextField, Typography,
} from '@mui/material';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
    DIAGRAM_BORDER_STYLES,
    DIAGRAM_CONTENT_INSET_DEFAULT,
    DIAGRAM_CONTENT_INSET_MAXIMUM,
    DIAGRAM_CONTENT_POSITIONS,
    type DiagramBorderStyle,
    type DiagramContentPosition,
    type DiagramNodeRoleFormatting,
} from '../../../services/diagrams/diagram_data';
import { dialogService } from '../../../services/dialog_service';
import { ColorPickerButton } from '../../color_picker_button';
import { FormattingGroup } from '../../formatting_group';
import { DiagramFontFamilySelect } from './diagram_font_family_select';
import { OptionalSliderField } from './optional_slider_field';

const DEFAULT_CUSTOM_FONT_SIZE = 14;
const DEFAULT_CUSTOM_BORDER_THICKNESS = 1;
const DEFAULT_CUSTOM_CORNER_RADIUS = 8;
const HALF_WIDTH_SX = { flex: '1 1 0', minWidth: 0 };
const BORDER_STYLE_LABELS: Record<DiagramBorderStyle, string> = {
    dashed: 'Dashed',
    dotted: 'Dotted',
    double: 'Double',
    solid: 'Solid',
};
const CONTENT_POSITION_LABELS: Record<DiagramContentPosition, string> = {
    'bottom-center': 'Bottom center',
    'bottom-left': 'Bottom left',
    'bottom-right': 'Bottom right',
    center: 'Center',
    'center-left': 'Center left',
    'center-right': 'Center right',
    'top-center': 'Top center',
    'top-left': 'Top left',
    'top-right': 'Top right',
};

interface NodeFormattingPopoverProps {
    anchorElement: HTMLElement;
    label: string;
    onApply(value: DiagramNodeRoleFormatting): void;
    onClose(): void;
    value?: DiagramNodeRoleFormatting;
}

function optionalString(value: string) {
    return value.trim() === '' ? undefined : value.trim();
}

function reportFormattingError(error: unknown) {
    dialogService.error(error, { fallbackMessage: 'Diagram formatting could not be applied' });
}

/** Node-role formatting draft. Apply is one service transaction; closing discards draft. */
export function NodeFormattingPopover({ anchorElement, label, onApply, onClose, value }: NodeFormattingPopoverProps) {
    const [fontFamily, setFontFamily] = useState(value?.font?.family ?? '');
    const [fontSize, setFontSize] = useState(value?.font?.size);
    const [fontColor, setFontColor] = useState(value?.font?.color);
    const [bold, setBold] = useState(value?.font?.bold ?? false);
    const [italic, setItalic] = useState(value?.font?.italic ?? false);
    const [underline, setUnderline] = useState(value?.font?.underline ?? false);
    const [fillColor, setFillColor] = useState(value?.box?.fillColor);
    const [borderColor, setBorderColor] = useState(value?.box?.borderColor);
    const [borderStyle, setBorderStyle] = useState(value?.box?.borderStyle ?? 'solid');
    const [borderThickness, setBorderThickness] = useState(value?.box?.borderThickness);
    const [cornerRadius, setCornerRadius] = useState(value?.box?.cornerRadius);
    const [contentPosition, setContentPosition] = useState(value?.box?.contentPosition ?? 'center');
    const [autoWrap, setAutoWrap] = useState(value?.box?.autoWrap ?? true);
    const [contentInset, setContentInset] = useState<number | undefined>(value?.box?.contentInset ?? DIAGRAM_CONTENT_INSET_DEFAULT);
    const handleBorderStyle = (event: ChangeEvent<HTMLInputElement>) => setBorderStyle(event.target.value as DiagramBorderStyle);
    const handleContentPosition = (event: ChangeEvent<HTMLInputElement>) => {
        setContentPosition(event.target.value as DiagramContentPosition);
    };
    const handleBold = (event: ChangeEvent<HTMLInputElement>) => setBold(event.target.checked);
    const handleItalic = (event: ChangeEvent<HTMLInputElement>) => setItalic(event.target.checked);
    const handleUnderline = (event: ChangeEvent<HTMLInputElement>) => setUnderline(event.target.checked);
    const handleAutoWrap = (event: ChangeEvent<HTMLInputElement>) => setAutoWrap(event.target.checked);
    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const formatting: DiagramNodeRoleFormatting = {
            box: {
                autoWrap,
                borderColor,
                borderStyle,
                borderThickness,
                contentInset,
                contentPosition,
                cornerRadius,
                fillColor,
            },
            font: {bold, color: fontColor, family: optionalString(fontFamily), italic, size: fontSize, underline},
        };
        try {
            onApply(formatting);
            onClose();
        } catch (error) {
            reportFormattingError(error);
        }
    };

    return (
        <Popover anchorEl={anchorElement} onClose={onClose} open>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', maxHeight: '70vh', width: 380 }}>
                <Box sx={{ minHeight: 0, overflowY: 'auto', p: 2 }}>
                    <Stack spacing={1}>
                        <Typography variant="subtitle2">Format {label} nodes</Typography>
                        <FormattingGroup id="diagram-node-font" label="Font">
                            <DiagramFontFamilySelect onChange={setFontFamily} value={fontFamily} />
                            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                <FormControlLabel control={<Switch checked={bold} onChange={handleBold} />} label="Bold" />
                                <FormControlLabel control={<Switch checked={italic} onChange={handleItalic} />} label="Italic" />
                                <FormControlLabel control={<Switch checked={underline} onChange={handleUnderline} />} label="Underline" />
                            </Stack>
                        </FormattingGroup>
                        <FormattingGroup id="diagram-node-size-color" label="Size & color">
                            <OptionalSliderField initialCustomValue={DEFAULT_CUSTOM_FONT_SIZE} label="Font size" maximum={200} minimum={1} onChange={setFontSize} unit="px" value={fontSize} />
                            <ColorPickerButton label="Font color" onChange={setFontColor} value={fontColor} />
                        </FormattingGroup>
                        <FormattingGroup id="diagram-node-box" label="Box">
                            <FormControlLabel control={<Switch checked={autoWrap} onChange={handleAutoWrap} />} label="Auto wrap" />
                            <OptionalSliderField initialCustomValue={DIAGRAM_CONTENT_INSET_DEFAULT} label="Content inset" maximum={DIAGRAM_CONTENT_INSET_MAXIMUM} minimum={0} onChange={setContentInset} unit="px" value={contentInset} />
                            <Stack direction="row" spacing={1}>
                                <Box sx={HALF_WIDTH_SX}><ColorPickerButton label="Fill color" onChange={setFillColor} value={fillColor} /></Box>
                                <Box sx={HALF_WIDTH_SX}><ColorPickerButton label="Border color" onChange={setBorderColor} value={borderColor} /></Box>
                            </Stack>
                            <TextField fullWidth label="Content position" onChange={handleContentPosition} select size="small" value={contentPosition}>
                                {DIAGRAM_CONTENT_POSITIONS.map((position) => (
                                    <MenuItem key={position} value={position}>{CONTENT_POSITION_LABELS[position]}</MenuItem>
                                ))}
                            </TextField>
                        </FormattingGroup>
                        <FormattingGroup id="diagram-node-border" label="Border">
                            <TextField fullWidth label="Border style" onChange={handleBorderStyle} select size="small" value={borderStyle}>
                                {DIAGRAM_BORDER_STYLES.map((style) => (
                                    <MenuItem key={style} value={style}>{BORDER_STYLE_LABELS[style]}</MenuItem>
                                ))}
                            </TextField>
                            <OptionalSliderField initialCustomValue={DEFAULT_CUSTOM_BORDER_THICKNESS} label="Border thickness" maximum={20} minimum={0} onChange={setBorderThickness} unit="px" value={borderThickness} />
                            <OptionalSliderField initialCustomValue={DEFAULT_CUSTOM_CORNER_RADIUS} label="Corner radius" maximum={100} minimum={0} onChange={setCornerRadius} unit="px" value={cornerRadius} />
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
