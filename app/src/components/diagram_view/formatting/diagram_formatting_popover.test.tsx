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
                        autoWrap: false, borderColor: '#3949ab', borderStyle: 'dashed', borderThickness: 3,
                        contentInset: 12, contentPosition: 'bottom-right', cornerRadius: 12, fillColor: '#1976d2',
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
    it('shows groups and saved override values', async () => {
        const user = userEvent.setup();
        renderPopover();

        for (const name of ['Font', 'Size & color', 'Box', 'Border']) {
            expect(screen.getByRole('region', { name })).toBeInTheDocument();
        }
        expect(screen.getByRole('combobox', { name: 'Font family' })).toHaveTextContent('Inter');
        expect(screen.getByRole('switch', { name: 'Bold' })).toBeChecked();
        expect(screen.getByRole('slider', { name: 'Font size' })).toHaveAttribute('aria-valuenow', '17');
        expect(screen.getByRole('slider', { name: 'Border thickness' })).toHaveAttribute('aria-valuenow', '3');
        expect(screen.getByRole('slider', { name: 'Corner radius' })).toHaveAttribute('aria-valuenow', '12');
        for (const [label, color] of [['Font color', '#d32f2f'], ['Fill color', '#1976d2'], ['Border color', '#3949ab']]) {
            await user.click(screen.getByRole('button', { name: label }));
            expect(screen.getByLabelText(label, { selector: 'input' })).toHaveValue(color);
            await user.keyboard('{Escape}');
        }
        expect(screen.getByRole('combobox', { name: 'Border style' })).toHaveTextContent('Dashed');
        expect(screen.getByRole('combobox', { name: 'Content position' })).toHaveTextContent('Bottom right');
        expect(screen.getByRole('switch', { name: 'Auto wrap' })).not.toBeChecked();
        expect(screen.getByRole('slider', { name: 'Content inset' })).toHaveAttribute('aria-valuenow', '12');
    });

    it('resets only chosen overrides and stores friendly select choices as existing enums', async () => {
        const user = userEvent.setup();
        const { onApply, onClose } = renderPopover();

        await user.click(screen.getByRole('button', { name: 'Font color' }));
        await user.click(screen.getByRole('button', { name: 'Use default colour' }));
        await user.keyboard('{Escape}');
        await user.click(screen.getByRole('switch', { name: 'Custom Border thickness' }));
        await user.click(screen.getByRole('combobox', { name: 'Content position' }));
        await user.click(screen.getByRole('option', { name: 'Top left' }));
        await user.click(screen.getByRole('switch', { name: 'Auto wrap' }));
        screen.getByRole('slider', { name: 'Content inset' }).focus();
        await user.keyboard('{Home}');
        await user.click(screen.getByRole('button', { name: 'Apply' }));

        expect(onApply).toHaveBeenCalledOnce();
        expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
            box: expect.objectContaining({ autoWrap: true, borderThickness: undefined, contentInset: 0, contentPosition: 'top-left', fillColor: '#1976d2' }),
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

        const fontFamily = screen.getByRole('combobox', { name: 'Font family' });
        await user.click(fontFamily);
        await user.click(screen.getByRole('option', { name: 'Serif' }));
        await user.click(screen.getByRole('button', { name: 'Apply' }));

        expect(reportError).toHaveBeenCalledWith(expect.any(Error), { fallbackMessage: 'Diagram formatting could not be applied' });
        expect(onClose).not.toHaveBeenCalled();
        expect(fontFamily).toHaveTextContent('Serif');
        expect(screen.getByText('Format Service nodes')).toBeInTheDocument();
    });

    it('discards through Cancel without applying', async () => {
        const user = userEvent.setup();
        const { onApply, onClose } = renderPopover();

        await user.click(screen.getByRole('switch', { name: 'Auto wrap' }));
        screen.getByRole('slider', { name: 'Content inset' }).focus();
        await user.keyboard('{End}');
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onApply).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('clears an unknown saved family by choosing Theme default', async () => {
        const user = userEvent.setup();
        const { onApply } = renderPopover();

        await user.click(screen.getByRole('combobox', { name: 'Font family' }));
        expect(screen.getByRole('option', { name: 'Inter' })).toBeInTheDocument();
        await user.click(screen.getByRole('option', { name: 'Theme default' }));
        await user.click(screen.getByRole('button', { name: 'Apply' }));

        expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ font: expect.objectContaining({ family: undefined }) }));
    });
});
