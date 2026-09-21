import { Button, Slider, Stack, Typography } from '@mui/material';
import { useId, useState } from 'react';

interface OptionalSliderFieldProps {
    helperText: string;
    initialCustomValue: number;
    label: string;
    maximum: number;
    minimum: number;
    onChange(value: number | undefined): void;
    unit: string;
    value?: number;
}

/** Bounded slider with explicit default/custom state for optional diagram formatting. */
export function OptionalSliderField(props: OptionalSliderFieldProps) {
    const { helperText, initialCustomValue, label, maximum, minimum, onChange, unit, value } = props;
    const labelId = useId();
    const [customValue, setCustomValue] = useState(value ?? initialCustomValue);
    const displayedValue = value ?? customValue;
    const handleChange = (_event: Event, nextValue: number | number[]) => {
        if (Array.isArray(nextValue)) throw new Error(`${label} requires one slider value`);
        setCustomValue(nextValue);
        onChange(nextValue);
    };
    const handleUseCustom = () => onChange(customValue);
    const handleUseDefault = () => onChange(undefined);

    return (
        <Stack spacing={0.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography color="text.secondary" id={labelId} variant="caption">{label}</Typography>
                <Typography aria-label={`${label} value`} variant="body2">
                    {value === undefined ? 'Default' : `${value} ${unit}`}
                </Typography>
            </Stack>
            <Slider
                aria-labelledby={labelId}
                disabled={value === undefined}
                max={maximum}
                min={minimum}
                onChange={handleChange}
                value={displayedValue}
                valueLabelDisplay="auto"
            />
            <Button
                aria-label={value === undefined ? `Use custom value for ${label}` : `Use default for ${label}`}
                onClick={value === undefined ? handleUseCustom : handleUseDefault}
                size="small"
                variant="outlined"
            >
                {value === undefined ? 'Use custom value' : 'Use default'}
            </Button>
            <Typography color="text.secondary" variant="caption">{helperText}</Typography>
        </Stack>
    );
}
