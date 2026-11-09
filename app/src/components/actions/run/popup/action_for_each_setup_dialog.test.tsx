import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionForEachConfig, JsonValue } from '../../../../data/action_run_types';
import { dialogService } from '../../../../services/dialog_service';
import { AppThemeProvider } from '../../../../theme/theme_provider';
import { ActionForEachSetupDialog } from './action_for_each_setup_dialog';

const ROOT_OBJECT = { data: { items: [1, 2] }, name: 'records' };

function config(value: JsonValue, dataPath?: string): ActionForEachConfig {
    return { ...(dataPath ? { dataPath } : {}), failurePolicy: 'logAndContinue', fileName: 'records.json', mode: 'addPrompt', value };
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
        await user.click(screen.getByRole('combobox', { name: 'On failure' }));
        await user.click(screen.getByRole('option', { name: 'Stop on first failure' }));
        await user.type(screen.getByRole('textbox', { name: 'Path to list data' }), ' data.items ');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        const expected: ActionForEachConfig = { ...config(ROOT_OBJECT, 'data.items'), failurePolicy: 'stopOnFirstFailure', mode: 'compact' };
        expect(onSave).toHaveBeenCalledWith(expected);
    });

    it('discards staged edits on Cancel', async () => {
        const user = userEvent.setup();
        const { onCancel, onSave } = renderDialog(config(ROOT_OBJECT));

        await user.type(screen.getByRole('textbox', { name: 'Path to list data' }), 'data.items');
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

    it('blocks changes while the loop is active', () => {
        renderDialog(config(ROOT_OBJECT), true);

        expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
        expect(screen.getByRole('textbox', { name: 'Path to list data' })).toBeDisabled();
        expect(screen.getByRole('combobox', { name: 'At end' })).toHaveAttribute('aria-disabled', 'true');
    });
});
