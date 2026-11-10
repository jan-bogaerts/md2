import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppThemeProvider } from '../../theme/theme_provider';
import { JsonDataDocument } from '../../services/json/json_data_document';

const mocks = vi.hoisted(() => ({
    activateDocument: vi.fn(),
    closeDocument: vi.fn(),
    snapshot: { activeDocument: null, documents: [] } as { activeDocument: unknown, documents: unknown[] },
}));

vi.mock('../hooks/use_open_files', () => ({ useOpenFiles: () => mocks.snapshot }));
vi.mock('../../services/open_files_service', () => ({ openFilesService: { activateDocument: mocks.activateDocument, closeDocument: mocks.closeDocument } }));
vi.mock('../actions/editor/list_action_editor', () => ({ ListActionEditor: () => null }));
vi.mock('./card_editor', () => ({ CardEditor: () => null }));
vi.mock('./instruction_editor', () => ({ InstructionEditor: () => null }));

import { TextEditorPane } from './text_editor_pane';

const props = {
    actionsFolder: 'design/actions',
    cardTypes: [],
    specialContextTypes: [],
    states: [],
    statusColors: new Map<string, string>(),
};

describe('JSON list-view integration', () => {
    afterEach(() => {
        cleanup();
        mocks.activateDocument.mockClear();
        mocks.closeDocument.mockClear();
    });

    it('shows active JSON editor in one tab, survives rerender, and closes through tab control', () => {
        const document = new JsonDataDocument('design/data.json', [{ value: 1 }], false);
        mocks.snapshot = { activeDocument: document, documents: [document] };
        const view = render(<AppThemeProvider><TextEditorPane {...props} /></AppThemeProvider>);

        expect(screen.getByRole('tab', { name: 'data.json' })).toBeInTheDocument();
        expect(screen.getByRole('table', { name: 'JSON array' })).toBeInTheDocument();

        document.setSelectedRows([0]);
        view.rerender(<AppThemeProvider><TextEditorPane {...props} /></AppThemeProvider>);
        expect(screen.getByRole('checkbox', { name: 'Select row 1' })).toBeChecked();

        fireEvent.click(screen.getByRole('button', { name: 'Close data.json' }));
        expect(mocks.closeDocument).toHaveBeenCalledWith(document);
    });
});
