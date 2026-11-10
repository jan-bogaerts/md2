import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtuosoMockContext } from 'react-virtuoso';
import { AppThemeProvider } from '../../theme/theme_provider';
import { JsonDataDocument } from '../../services/json/json_data_document';
import { JsonDataEditor } from './json_data_editor';

function renderEditor(document: JsonDataDocument) {
    return render(
        <AppThemeProvider>
            <VirtuosoMockContext.Provider value={{ itemHeight: 53, viewportHeight: 424 }}>
                <JsonDataEditor document={document} />
            </VirtuosoMockContext.Provider>
        </AppThemeProvider>,
    );
}

describe('JsonDataEditor', () => {
    afterEach(cleanup);

    beforeEach(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText: vi.fn(), writeText: vi.fn(async () => undefined) },
        });
    });

    it('renders object fields as field-name and value columns in a card and preserves scalar types while editing', async () => {
        const user = userEvent.setup();
        const document = new JsonDataDocument('data.json', { active: true, count: 2, name: 'old', nothing: null }, false);
        renderEditor(document);

        expect(screen.getByRole('region', { name: 'JSON data editor' })).toBeInTheDocument();
        expect(screen.getByRole('group', { name: 'Object fields' })).toBeInTheDocument();
        expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Field', 'Value']);
        expect(screen.getByRole('separator', { name: 'Resize field name column' })).toHaveAttribute('aria-orientation', 'vertical');
        await user.click(screen.getByRole('checkbox', { name: 'active' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'count' }), { target: { value: '4' } });
        fireEvent.blur(screen.getByRole('textbox', { name: 'count' }));
        await user.clear(screen.getByRole('textbox', { name: 'name' }));
        await user.type(screen.getByRole('textbox', { name: 'name' }), 'new');

        expect(document.getValue()).toEqual({ active: false, count: 4, name: 'new', nothing: null });
        expect(screen.getByRole('textbox', { name: 'nothing' })).toHaveValue('null');
        expect(screen.getByRole('textbox', { name: 'name' }).closest('.MuiTextField-root')).toHaveStyle({ width: '100%' });
    });

    it('resizes the field-name column with the keyboard', async () => {
        const user = userEvent.setup();
        const document = new JsonDataDocument('data.json', { nested: {}, rows: [] }, false);
        renderEditor(document);
        const splitter = screen.getByRole('separator', { name: 'Resize field name column' });
        const initialWidth = Number(splitter.getAttribute('aria-valuenow'));

        splitter.focus();
        await user.keyboard('{ArrowRight}');

        expect(splitter).toHaveAttribute('aria-valuenow', String(initialWidth + 24));
        expect(screen.getByRole('button', { name: 'Open object' })).toHaveClass('MuiButton-text');
        expect(screen.getByRole('button', { name: 'Open array (0)' })).toHaveClass('MuiButton-text');
    });

    it('resizes from captured pointer width without jumping and clamps both columns', () => {
        const document = new JsonDataDocument('data.json', { name: 'value' }, false);
        renderEditor(document);
        const fields = screen.getByRole('group', { name: 'Object fields' });
        vi.spyOn(fields, 'getBoundingClientRect').mockReturnValue({
            bottom: 200,
            height: 200,
            left: 100,
            right: 600,
            toJSON: () => ({}),
            top: 0,
            width: 500,
            x: 100,
            y: 0,
        });
        const splitter = screen.getByRole('separator', { name: 'Resize field name column' });

        fireEvent.pointerDown(splitter, { clientX: 276, pointerId: 1 });
        expect(splitter).toHaveAttribute('aria-valuenow', '180');
        fireEvent.pointerMove(splitter, { clientX: 286, pointerId: 1 });
        expect(splitter).toHaveAttribute('aria-valuenow', '190');
        fireEvent.pointerUp(splitter, { clientX: 286, pointerId: 1 });

        fireEvent.pointerDown(splitter, { clientX: 290, pointerId: 2 });
        fireEvent.pointerMove(splitter, { clientX: 0, pointerId: 2 });
        expect(splitter).toHaveAttribute('aria-valuenow', '120');
        fireEvent.pointerUp(splitter, { clientX: 0, pointerId: 2 });

        fireEvent.pointerDown(splitter, { clientX: 220, pointerId: 3 });
        fireEvent.pointerMove(splitter, { clientX: 700, pointerId: 3 });
        expect(splitter).toHaveAttribute('aria-valuenow', '340');
        expect(splitter).toHaveAttribute('aria-valuemax', '340');
        fireEvent.pointerCancel(splitter, { clientX: 700, pointerId: 3 });
    });

    it('commits complete JSON numbers and keeps invalid numeric input out of document data', async () => {
        const user = userEvent.setup();
        const document = new JsonDataDocument('data.json', { count: 2 }, false);
        renderEditor(document);
        const input = screen.getByRole('textbox', { name: 'count' });

        await user.clear(input);
        await user.type(input, '-1.25e2');
        await user.tab();
        expect(document.getValue()).toEqual({ count: -125 });

        await user.click(input);
        await user.clear(input);
        await user.type(input, '01');
        await user.tab();
        expect(document.getValue()).toEqual({ count: -125 });
        expect(screen.getByText('Enter a valid JSON number')).toBeInTheDocument();
    });

    it('drills into nested values and returns through exact breadcrumb ancestors', async () => {
        const user = userEvent.setup();
        const document = new JsonDataDocument('folder/data.json', { nested: { rows: [1] } }, false);
        renderEditor(document);

        await user.click(screen.getByRole('button', { name: 'Open object' }));
        screen.getByRole('button', { name: 'Open array (1)' }).focus();
        await user.keyboard('{Enter}');

        expect(screen.getByRole('navigation', { name: 'JSON path' })).toHaveTextContent('data.json/nested/rows');
        await user.click(screen.getByRole('button', { name: 'nested' }));
        expect(document.getSnapshot().location).toEqual(['nested']);
    });

    it('renders object-only arrays with first-seen union columns and editable missing fields', async () => {
        const user = userEvent.setup();
        const document = new JsonDataDocument('data.json', [{ id: 1 }, { name: 'second', id: 2 }], false);
        renderEditor(document);

        const table = screen.getByRole('table', { name: 'JSON array' });
        expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Select', 'id', 'name']);
        await user.type(screen.getByRole('textbox', { name: 'name row 1' }), 'first');

        expect(document.getValue()).toEqual([{ id: 1, name: 'first' }, { name: 'second', id: 2 }]);
    });

    it.each([
        { label: 'empty', value: [] },
        { label: 'primitive', value: [1, 2] },
        { label: 'mixed', value: [{ id: 1 }, 2] },
    ])('renders $label arrays with one values column', ({ value }) => {
        renderEditor(new JsonDataDocument('data.json', value, false));

        expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Select', 'values']);
    });

    it('only mounts array rows inside the virtualized viewport', () => {
        const rows = Array.from({ length: 100 }, (_value, index) => index + 1);
        renderEditor(new JsonDataDocument('data.json', rows, false));

        expect(screen.getByRole('textbox', { name: 'Value row 1' })).toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: 'Value row 100' })).not.toBeInTheDocument();
    });

    it('supports root scalar edits and ordered add, multi-select, delete, copy, and paste operations', async () => {
        const user = userEvent.setup();
        const readText = vi.fn();
        const writeText = vi.fn(async () => undefined);
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } });
        const scalar = new JsonDataDocument('scalar.json', 'before', false);
        const scalarView = renderEditor(scalar);
        await user.clear(screen.getByRole('textbox', { name: 'JSON value' }));
        await user.type(screen.getByRole('textbox', { name: 'JSON value' }), 'after');
        expect(scalar.getValue()).toBe('after');
        scalarView.unmount();

        const document = new JsonDataDocument('array.json', [1, 2, 3], false);
        renderEditor(document);
        await user.click(screen.getByRole('checkbox', { name: 'Select row 1' }));
        await user.click(screen.getByRole('checkbox', { name: 'Select row 3' }));
        await user.click(screen.getByRole('button', { name: 'Copy' }));
        expect(writeText).toHaveBeenCalledWith('[\n  1,\n  3\n]');

        await user.click(screen.getByRole('button', { name: 'Delete' }));
        expect(document.getValue()).toEqual([2]);
        readText.mockResolvedValueOnce('[3,4]');
        await user.click(screen.getByRole('button', { name: 'Paste' }));
        expect(document.getValue()).toEqual([2, 3, 4]);
        await user.click(screen.getByRole('button', { name: 'Add' }));
        expect(document.getValue()).toEqual([2, 3, 4, null]);
    });

    it('disables all mutation controls for read-only documents', () => {
        const document = new JsonDataDocument('data.json', [1], true);
        renderEditor(document);

        expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Cut' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Paste' })).toBeDisabled();
        expect(screen.getByRole('textbox', { name: 'Value row 1' })).toBeDisabled();
    });
});
