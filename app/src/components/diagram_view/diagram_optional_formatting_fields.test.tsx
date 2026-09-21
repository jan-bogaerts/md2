import { ThemeProvider } from '@mui/material';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppTheme } from '../../theme/app_theme';
import { ColorPickerField } from '../color_picker_field';
import { OptionalColorPickerField } from './optional_color_picker_field';
import { OptionalSliderField } from './optional_slider_field';

const theme = createAppTheme('dark');

afterEach(cleanup);

describe('ColorPickerField', () => {
    it('keeps required color selection behavior', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(
            <ThemeProvider theme={theme}>
                <ColorPickerField label="Required color" onChange={onChange} value="#d32f2f" />
            </ThemeProvider>,
        );

        expect(screen.getByLabelText('Required color')).toHaveValue('#d32f2f');
        fireEvent.change(screen.getByLabelText('Required color'), { target: { value: '#00897b' } });
        expect(onChange).toHaveBeenCalledWith('#00897b');
        await user.click(screen.getByRole('button', { name: 'Use colour #1976d2' }));
        expect(onChange).toHaveBeenCalledWith('#1976d2');
        expect(screen.queryByRole('button', { name: 'Use default' })).not.toBeInTheDocument();
    });
});

describe('OptionalColorPickerField', () => {
    it('selects custom presets and returns to default', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        const view = render(
            <ThemeProvider theme={theme}>
                <OptionalColorPickerField helperText="Uses theme color by default." label="Font color" onChange={onChange} />
            </ThemeProvider>,
        );

        expect(screen.getByLabelText('Font color value')).toHaveTextContent('Default');
        await user.click(screen.getByRole('button', { name: 'Use custom color for Font color' }));
        expect(onChange).toHaveBeenLastCalledWith('#d32f2f');

        view.rerender(
            <ThemeProvider theme={theme}>
                <OptionalColorPickerField
                    helperText="Uses theme color by default."
                    label="Font color"
                    onChange={onChange}
                    value="#d32f2f"
                />
            </ThemeProvider>,
        );
        await user.click(screen.getByRole('button', { name: 'Use colour #1976d2' }));
        expect(onChange).toHaveBeenLastCalledWith('#1976d2');
        await user.click(screen.getByRole('button', { name: 'Use default for Font color' }));
        expect(onChange).toHaveBeenLastCalledWith(undefined);
    });
});

describe('OptionalSliderField', () => {
    function SliderHarness() {
        const [value, setValue] = useState<number>();

        return (
            <ThemeProvider theme={theme}>
                <OptionalSliderField
                    helperText="1-200 px. Uses theme size by default."
                    initialCustomValue={14}
                    label="Font size"
                    maximum={200}
                    minimum={1}
                    onChange={setValue}
                    unit="px"
                    value={value}
                />
            </ThemeProvider>
        );
    }

    it('exposes bounds and supports default, custom, and keyboard changes', async () => {
        const user = userEvent.setup();
        render(<SliderHarness />);

        const slider = screen.getByRole('slider', { name: 'Font size' });
        expect(slider).toHaveAttribute('aria-valuemin', '1');
        expect(slider).toHaveAttribute('aria-valuemax', '200');
        expect(slider).toBeDisabled();
        expect(screen.getByLabelText('Font size value')).toHaveTextContent('Default');

        await user.click(screen.getByRole('button', { name: 'Use custom value for Font size' }));
        expect(slider).toBeEnabled();
        expect(slider).toHaveAttribute('aria-valuenow', '14');
        slider.focus();
        await user.keyboard('{ArrowRight}');
        expect(slider).toHaveAttribute('aria-valuenow', '15');
        expect(screen.getByLabelText('Font size value')).toHaveTextContent('15 px');

        fireEvent.change(slider, { target: { value: '200' } });
        expect(slider).toHaveAttribute('aria-valuenow', '200');
        await user.click(screen.getByRole('button', { name: 'Use default for Font size' }));
        expect(slider).toBeDisabled();
        expect(screen.getByLabelText('Font size value')).toHaveTextContent('Default');
    });
});
