import {
    Box, Button, Checkbox, FormControlLabel, MenuItem, Popover, TextField, Typography,
} from '@mui/material';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
    DIAGRAM_BORDER_STYLES,
    DIAGRAM_CONTENT_POSITIONS,
    type DiagramBorderStyle,
    type DiagramContentPosition,
    type DiagramNodeRoleFormatting,
} from '../../../services/diagrams/diagram_data';
import { dialogService } from '../../../services/dialog_service';
import { OptionalColorPickerField } from './optional_color_picker_field';
import { OptionalSliderField } from './optional_slider_field';

const DEFAULT_CUSTOM_FONT_SIZE = 14;
const DEFAULT_CUSTOM_BORDER_THICKNESS = 1;
const DEFAULT_CUSTOM_CORNER_RADIUS = 8;
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
    const handleFontFamily = (event: ChangeEvent<HTMLInputElement>) => setFontFamily(event.target.value);
    const handleBorderStyle = (event: ChangeEvent<HTMLInputElement>) => setBorderStyle(event.target.value as DiagramBorderStyle);
    const handleContentPosition = (event: ChangeEvent<HTMLInputElement>) => {
        setContentPosition(event.target.value as DiagramContentPosition);
    };
    const handleBold = (event: ChangeEvent<HTMLInputElement>) => setBold(event.target.checked);
    const handleItalic = (event: ChangeEvent<HTMLInputElement>) => setItalic(event.target.checked);
    const handleUnderline = (event: ChangeEvent<HTMLInputElement>) => setUnderline(event.target.checked);
    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        const formatting: DiagramNodeRoleFormatting = {
            box: {
                borderColor,
                borderStyle,
                borderThickness,
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
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minHeight: 0, overflowY: 'auto', p: 2 }}>
                    <Typography variant="subtitle2">Format {label} nodes</Typography>
                    <Typography color="text.secondary" variant="overline">Font</Typography>
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
                        helperText="Uses the theme text color by default."
                        label="Font color"
                        onChange={setFontColor}
                        value={fontColor}
                    />
                    <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                        <FormControlLabel control={<Checkbox checked={bold} onChange={handleBold} />} label="Bold" />
                        <FormControlLabel control={<Checkbox checked={italic} onChange={handleItalic} />} label="Italic" />
                        <FormControlLabel control={<Checkbox checked={underline} onChange={handleUnderline} />} label="Underline" />
                    </Box>
                    <Typography color="text.secondary" variant="overline">Box</Typography>
                    <OptionalColorPickerField
                        helperText="Uses the node-role fill color by default."
                        label="Fill color"
                        onChange={setFillColor}
                        value={fillColor}
                    />
                    <OptionalColorPickerField
                        helperText="Uses the node-role border color by default."
                        label="Border color"
                        onChange={setBorderColor}
                        value={borderColor}
                    />
                    <TextField
                        helperText="Controls the box outline pattern."
                        label="Border style"
                        onChange={handleBorderStyle}
                        select
                        size="small"
                        value={borderStyle}
                    >
                        {DIAGRAM_BORDER_STYLES.map((style) => (
                            <MenuItem key={style} value={style}>{BORDER_STYLE_LABELS[style]}</MenuItem>
                        ))}
                    </TextField>
                    <OptionalSliderField
                        helperText="Choose 0-20 px, or use the theme thickness."
                        initialCustomValue={DEFAULT_CUSTOM_BORDER_THICKNESS}
                        label="Border thickness"
                        maximum={20}
                        minimum={0}
                        onChange={setBorderThickness}
                        unit="px"
                        value={borderThickness}
                    />
                    <OptionalSliderField
                        helperText="Choose 0-100 px, or use the theme radius."
                        initialCustomValue={DEFAULT_CUSTOM_CORNER_RADIUS}
                        label="Corner radius"
                        maximum={100}
                        minimum={0}
                        onChange={setCornerRadius}
                        unit="px"
                        value={cornerRadius}
                    />
                    <TextField
                        helperText="Controls where content sits inside the node."
                        label="Content position"
                        onChange={handleContentPosition}
                        select
                        size="small"
                        value={contentPosition}
                    >
                        {DIAGRAM_CONTENT_POSITIONS.map((position) => (
                            <MenuItem key={position} value={position}>{CONTENT_POSITION_LABELS[position]}</MenuItem>
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
