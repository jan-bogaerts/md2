import { Button, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { ColorPickerField } from '../../color_picker_field';
import { COLOR_PICKER_PALETTE } from '../../color_picker_palette';

interface OptionalColorPickerFieldProps {
    helperText: string;
    label: string;
    onChange(value: string | undefined): void;
    value?: string;
}

/** Color picker with an explicit default state for optional diagram formatting. */
export function OptionalColorPickerField({ helperText, label, onChange, value }: OptionalColorPickerFieldProps) {
    const [customValue, setCustomValue] = useState(value ?? COLOR_PICKER_PALETTE[0]);
    const handleChange = (nextValue: string) => {
        setCustomValue(nextValue);
        onChange(nextValue);
    };
    const handleUseCustom = () => onChange(customValue);
    const handleUseDefault = () => onChange(undefined);

    return (
        <Stack spacing={1}>
            {value === undefined ? (
                <Stack spacing={0.5}>
                    <Typography color="text.secondary" variant="caption">{label}</Typography>
                    <Typography aria-label={`${label} value`} variant="body2">Default</Typography>
                    <Button aria-label={`Use custom color for ${label}`} onClick={handleUseCustom} size="small" variant="outlined">
                        Use custom color
                    </Button>
                </Stack>
            ) : (
                <>
                    <ColorPickerField label={label} onChange={handleChange} value={value} />
                    <Button aria-label={`Use default for ${label}`} onClick={handleUseDefault} size="small" variant="outlined">
                        Use default
                    </Button>
                </>
            )}
            <Typography color="text.secondary" variant="caption">{helperText}</Typography>
        </Stack>
    );
}
