import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppThemeProvider } from '../../theme/theme_provider';
import { JsonDataDocument } from '../../services/json/json_data_document';

const mocks = vi.hoisted(() => ({
    copyTextToClipboard: vi.fn(),
    dialogError: vi.fn(),
    readTextFromClipboard: vi.fn(),
}));

vi.mock('../../services/clipboard_text', () => ({
    copyTextToClipboard: mocks.copyTextToClipboard,
    readTextFromClipboard: mocks.readTextFromClipboard,
}));
vi.mock('../../services/dialog_service', () => ({ dialogService: { error: mocks.dialogError } }));

import { JsonArrayActionsFooter } from './json_array_actions_footer';

function renderFooter(document: JsonDataDocument) {
    return render(
        <AppThemeProvider>
            <JsonArrayActionsFooter document={document} />
        </AppThemeProvider>,
    );
}

describe('JsonArrayActionsFooter', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('shows the list actions as named icon-only buttons', () => {
        renderFooter(new JsonDataDocument('data.json', [1], false));
        const buttons = within(screen.getByRole('toolbar', { name: 'List actions' })).getAllByRole('button');

        expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Add', 'Delete', 'Copy', 'Cut', 'Paste']);
        buttons.forEach((button) => {
            expect(button).toHaveTextContent(/^$/u);
            expect(button.querySelector('svg')).toBeInTheDocument();
        });
    });

    it('enables selection actions only after a row is selected', () => {
        const document = new JsonDataDocument('data.json', [1], false);
        renderFooter(document);

        expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Paste' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cut' })).toBeDisabled();

        act(() => document.setSelectedRows([0]));

        expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Cut' })).toBeEnabled();
    });

    it('keeps only copy available for a read-only document with a selection', () => {
        const document = new JsonDataDocument('data.json', [1], true);
        document.setSelectedRows([0]);
        renderFooter(document);

        expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cut' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Paste' })).toBeDisabled();
    });

    it('reports a clipboard failure through the dialog service and keeps the rows', async () => {
        const user = userEvent.setup();
        const clipboardError = new Error('clipboard denied');
        mocks.readTextFromClipboard.mockRejectedValueOnce(clipboardError);
        const document = new JsonDataDocument('data.json', [1], false);
        renderFooter(document);

        await user.click(screen.getByRole('button', { name: 'Paste' }));

        expect(mocks.dialogError).toHaveBeenCalledWith(clipboardError, { fallbackMessage: 'JSON rows could not be pasted' });
        expect(document.getValue()).toEqual([1]);
    });
});
