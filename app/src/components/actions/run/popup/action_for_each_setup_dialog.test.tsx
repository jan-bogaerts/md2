import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionForEachConfig, JsonValue } from '../../../../data/action_run_types';
import { dialogService } from '../../../../services/dialog_service';
import { AppThemeProvider } from '../../../../theme/theme_provider';
import { ActionForEachSetupDialog } from './action_for_each_setup_dialog';

const ROOT_OBJECT = { data: { items: [1, 2] }, name: 'records' };

function config(value: JsonValue, dataPath?: string): ActionForEachConfig {
    return {
        ...(dataPath ? { dataPath } : {}), failurePolicy: 'logAndContinue', fileName: 'records.json', mode: 'addPrompt',
        recordsPerBatch: 1, startIndex: 0, value,
    };
}

function renderDialog(forEach: ActionForEachConfig, disabled = false) {
    const onCancel = vi.fn();
    const onSave = vi.fn();
    render(
        <AppThemeProvider>
            <ActionForEachSetupDialog config={forEach} disabled={disabled} onCancel={onCancel} onSave={onSave} />
        </AppThemeProvider>,
    );

    return { onCancel, onSave };
}

beforeEach(() => {
    vi.spyOn(dialogService, 'displayError').mockReturnValue({ critical: false, id: 1, message: 'Failure', severity: 'error', title: 'Error' });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('ActionForEachSetupDialog', () => {
    it('saves one complete configuration with all staged settings', async () => {
        const user = userEvent.setup();
        const { onSave } = renderDialog(config(ROOT_OBJECT));

        await user.click(screen.getByRole('combobox', { name: 'At end' }));
        await user.click(screen.getByRole('option', { name: 'Compact' }));
        await user.clear(screen.getByRole('spinbutton', { name: 'Records per batch' }));
        await user.type(screen.getByRole('spinbutton', { name: 'Records per batch' }), '3');
        await user.click(screen.getByRole('combobox', { name: 'On failure' }));
        await user.click(screen.getByRole('option', { name: 'Stop on first failure' }));
        await user.clear(screen.getByRole('spinbutton', { name: 'Start index' }));
        await user.type(screen.getByRole('spinbutton', { name: 'Start index' }), '2');
        await user.type(screen.getByRole('textbox', { name: 'Path to list data' }), ' data.items ');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        const expected: ActionForEachConfig = { ...config(ROOT_OBJECT, 'data.items'), failurePolicy: 'stopOnFirstFailure', mode: 'compact', recordsPerBatch: 3, startIndex: 2 };
        expect(onSave).toHaveBeenCalledWith(expected);
    });

    it('shows records per batch for boundary modes and keeps its staged value across mode changes', async () => {
        const user = userEvent.setup();
        const { onSave } = renderDialog(config([1, 2]));

        expect(screen.queryByRole('spinbutton', { name: 'Records per batch' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('combobox', { name: 'At end' }));
        await user.click(screen.getByRole('option', { name: 'Compact' }));
        const field = screen.getByRole('spinbutton', { name: 'Records per batch' });
        expect(field).toHaveValue(1);
        await user.clear(field);
        await user.type(field, '3');
        await user.click(screen.getByRole('combobox', { name: 'At end' }));
        await user.click(screen.getByRole('option', { name: 'Add prompt' }));
        expect(screen.queryByRole('spinbutton', { name: 'Records per batch' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('combobox', { name: 'At end' }));
        await user.click(screen.getByRole('option', { name: 'New conversation' }));
        expect(screen.getByRole('spinbutton', { name: 'Records per batch' })).toHaveValue(3);
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(onSave).toHaveBeenCalledWith({ ...config([1, 2]), mode: 'newConversation', recordsPerBatch: 3 });
    });

    it.each(['', '0', '-1', '1.5', 'word', String(Number.MAX_SAFE_INTEGER + 1)])(
        'reports invalid records per batch %s and does not save',
        async (value) => {
            const user = userEvent.setup();
            const { onSave } = renderDialog({ ...config([1, 2]), mode: 'compact' });
            const field = screen.getByRole('spinbutton', { name: 'Records per batch' });

            await user.clear(field);
            if (value) await user.type(field, value);
            await user.click(screen.getByRole('button', { name: 'Save' }));

            expect(dialogService.displayError).toHaveBeenCalledWith(
                `Records per batch must be a positive whole number no greater than ${Number.MAX_SAFE_INTEGER}`,
            );
            expect(onSave).not.toHaveBeenCalled();
        },
    );

    it('defaults a missing start index to zero', () => {
        renderDialog({ ...config([1, 2]), startIndex: undefined } as unknown as ActionForEachConfig);

        expect(screen.getByRole('spinbutton', { name: 'Start index' })).toHaveValue(0);
    });

    it('discards staged edits on Cancel', async () => {
        const user = userEvent.setup();
        const { onCancel, onSave } = renderDialog(config(ROOT_OBJECT));

        await user.type(screen.getByRole('textbox', { name: 'Path to list data' }), 'data.items');
        await user.clear(screen.getByRole('spinbutton', { name: 'Start index' }));
        await user.type(screen.getByRole('spinbutton', { name: 'Start index' }), '2');
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(onCancel).toHaveBeenCalledOnce();
        expect(onSave).not.toHaveBeenCalled();
    });

    it('offers the list path only for a root object', () => {
        renderDialog(config([1, 2]));

        expect(screen.queryByRole('textbox', { name: 'Path to list data' })).not.toBeInTheDocument();
    });

    it('starts from the saved path and removes it when cleared', async () => {
        const user = userEvent.setup();
        const { onSave } = renderDialog(config(ROOT_OBJECT, 'data.items'));
        const field = screen.getByRole('textbox', { name: 'Path to list data' });
        expect(field).toHaveValue('data.items');

        await user.clear(field);
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(onSave).toHaveBeenCalledWith(config(ROOT_OBJECT));
    });

    it.each([
        ['missing', 'Missing for-each data path: missing'],
        ['name', 'For-each data path is not a list: name'],
    ])('reports selector %s and does not save', async (dataPath, message) => {
        const user = userEvent.setup();
        const { onSave } = renderDialog(config(ROOT_OBJECT));

        await user.type(screen.getByRole('textbox', { name: 'Path to list data' }), dataPath);
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(dialogService.displayError).toHaveBeenCalledWith(message);
        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    });

    it.each(['', '-1', '1.5', String(Number.MAX_SAFE_INTEGER + 1)])('reports invalid start index %s and does not save', async (value) => {
        const user = userEvent.setup();
        const { onSave } = renderDialog(config([1, 2]));
        const field = screen.getByRole('spinbutton', { name: 'Start index' });

        await user.clear(field);
        if (value) await user.type(field, value);
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(dialogService.displayError).toHaveBeenCalledWith(
            `Start index must be a non-negative whole number no greater than ${Number.MAX_SAFE_INTEGER}`,
        );
        expect(onSave).not.toHaveBeenCalled();
    });

    it('blocks changes while the loop is active', () => {
        renderDialog(config(ROOT_OBJECT), true);

        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(screen.getByRole('spinbutton', { name: 'Start index' })).toBeDisabled();
        expect(screen.getByRole('textbox', { name: 'Path to list data' })).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'At end' })).toHaveAttribute('aria-disabled', 'true');
    });
});
