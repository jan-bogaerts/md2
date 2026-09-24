import { ThemeProvider } from '@mui/material';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dialogService } from '../../../services/dialog_service';
import { createAppTheme } from '../../../theme/app_theme';
import { NodeFormattingPopover } from './diagram_formatting_popover';

const theme = createAppTheme('dark');

function renderPopover(onApply = vi.fn(), onClose = vi.fn()) {
    const anchorElement = document.createElement('button');
    document.body.appendChild(anchorElement);
    render(
        <ThemeProvider theme={theme}>
            <NodeFormattingPopover
                anchorElement={anchorElement}
                label="Service"
                onApply={onApply}
                onClose={onClose}
                value={{
                    box: {
                        borderColor: '#3949ab', borderStyle: 'dashed', borderThickness: 3,
                        contentPosition: 'bottom-right', cornerRadius: 12, fillColor: '#1976d2',
                    },
                    font: { bold: true, color: '#d32f2f', family: 'Inter', italic: false, size: 17, underline: true },
                }}
            />
        </ThemeProvider>,
    );

    return { onApply, onClose };
}

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('NodeFormattingPopover', () => {
    it('shows labels, guidance, and saved override values', () => {
        renderPopover();

        expect(screen.getByRole('textbox', { name: 'Font family' })).toHaveValue('Inter');
        expect(screen.getByRole('slider', { name: 'Font size' })).toHaveAttribute('aria-valuenow', '17');
        expect(screen.getByRole('slider', { name: 'Border thickness' })).toHaveAttribute('aria-valuenow', '3');
        expect(screen.getByRole('slider', { name: 'Corner radius' })).toHaveAttribute('aria-valuenow', '12');
        expect(screen.getByLabelText('Font color')).toHaveValue('#d32f2f');
        expect(screen.getByLabelText('Fill color')).toHaveValue('#1976d2');
        expect(screen.getByLabelText('Border color')).toHaveValue('#3949ab');
        expect(screen.getByRole('combobox', { name: 'Border style' })).toHaveTextContent('Dashed');
        expect(screen.getByRole('combobox', { name: 'Content position' })).toHaveTextContent('Bottom right');
        expect(screen.getByText('Choose 1-200 px, or use the theme size.')).toBeInTheDocument();
        expect(screen.getByText('Choose 0-100 px, or use the theme radius.')).toBeInTheDocument();
    });

    it('resets only chosen overrides and stores friendly select choices as existing enums', async () => {
        const user = userEvent.setup();
        const { onApply, onClose } = renderPopover();

        await user.click(screen.getByRole('button', { name: 'Use default for Font color' }));
        await user.click(screen.getByRole('button', { name: 'Use default for Border thickness' }));
        await user.click(screen.getByRole('combobox', { name: 'Content position' }));
        await user.click(screen.getByRole('option', { name: 'Top left' }));
        await user.click(screen.getByRole('button', { name: 'Apply' }));

        expect(onApply).toHaveBeenCalledOnce();
        expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
            box: expect.objectContaining({ borderThickness: undefined, contentPosition: 'top-left', fillColor: '#1976d2' }),
            font: expect.objectContaining({ color: undefined, family: 'Inter', size: 17 }),
        }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('keeps draft open when Apply fails and reports through dialogService', async () => {
        const user = userEvent.setup();
        const onApply = vi.fn(() => { throw new Error('Invalid formatting'); });
        const onClose = vi.fn();
        const reportError = vi.spyOn(dialogService, 'error').mockReturnValue({critical: false, id: 1, message: 'Invalid formatting', severity: 'error', title: 'Error'});
        renderPopover(onApply, onClose);

        const fontFamily = screen.getByRole('textbox', { name: 'Font family' });
        await user.clear(fontFamily);
        await user.type(fontFamily, 'serif');
        await user.click(screen.getByRole('button', { name: 'Apply' }));

        expect(reportError).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Diagram formatting could not be applied' });
        expect(onClose).not.toHaveBeenCalled();
        expect(fontFamily).toHaveValue('serif');
        expect(screen.getByText('Format Service nodes')).toBeInTheDocument();
    });

    it('discards through Cancel without applying', async () => {
        const user = userEvent.setup();
        const { onApply, onClose } = renderPopover();

        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onApply).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
    });
});
