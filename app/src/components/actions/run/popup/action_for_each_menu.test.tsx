import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActionForEachConfig } from '../../../../data/action_run_types';
import { AppThemeProvider } from '../../../../theme/theme_provider';
import { ActionForEachMenu } from './action_for_each_menu';

const CONFIG: ActionForEachConfig = { failurePolicy: 'logAndContinue', fileName: 'records.json', mode: 'addPrompt', recordsPerBatch: 1, startIndex: 0, value: { items: [1] } };

async function openMenu(disabled = false) {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onRemove = vi.fn();
    const onView = vi.fn();
    render(
        <AppThemeProvider>
            <ActionForEachMenu config={CONFIG} disabled={disabled} onChange={onChange} onRemove={onRemove} onView={onView} />
        </AppThemeProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'For each: records.json' }));

    return { onChange, onRemove, onView, user };
}

afterEach(() => {
    cleanup();
});

describe('ActionForEachMenu', () => {
    it('offers View, Remove and one Setup item', async () => {
        await openMenu();

        expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['View', 'Remove', 'Setup']);
    });

    it('keeps View and Remove working', async () => {
        const { onRemove, onView, user } = await openMenu();
        await user.click(screen.getByRole('menuitem', { name: 'View' }));
        expect(onView).toHaveBeenCalledOnce();

        await user.click(screen.getByRole('button', { name: 'For each: records.json' }));
        await user.click(await screen.findByRole('menuitem', { name: 'Remove' }));
        expect(onRemove).toHaveBeenCalledOnce();
    });

    it('locks Setup and Remove while the loop is active', async () => {
        await openMenu(true);

        expect(screen.getByRole('menuitem', { name: 'Setup' })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('reports saved setup and closes the dialog', async () => {
        const { onChange, user } = await openMenu();
        await user.click(screen.getByRole('menuitem', { name: 'Setup' }));
        await user.type(await screen.findByRole('textbox', { name: 'Path to list data' }), 'items');
        await user.click(screen.getByRole('button', { name: 'Save' }));

        expect(onChange).toHaveBeenCalledWith({ ...CONFIG, dataPath: 'items' });
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('reports nothing when setup is cancelled', async () => {
        const { onChange, user } = await openMenu();
        await user.click(screen.getByRole('menuitem', { name: 'Setup' }));
        await user.click(await screen.findByRole('button', { name: 'Cancel' }));

        expect(onChange).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
});
