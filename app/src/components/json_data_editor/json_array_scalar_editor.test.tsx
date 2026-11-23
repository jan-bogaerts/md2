import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JsonDataDocument } from '../../services/json/json_data_document';
import type { JsonLocationSegment } from '../../services/json/json_types';
import { JsonArrayScalarEditor } from './json_array_scalar_editor';

interface ScalarHarnessProps {
    accessibleName: string;
    document: JsonDataDocument;
    location: readonly JsonLocationSegment[];
}

function ScalarHarness({ accessibleName, document, location }: ScalarHarnessProps) {
    useSyncExternalStore(document.subscribe, document.getSnapshot, document.getSnapshot);
    const value = document.getValueAt(location);
    if (value === undefined || typeof value === 'object' && value !== null) throw new Error('ScalarHarness requires a JSON primitive');

    return <JsonArrayScalarEditor accessibleName={accessibleName} document={document} location={location} value={value} />;
}

describe('JsonArrayScalarEditor', () => {
    afterEach(cleanup);

    it('updates string and boolean document values immediately through native controls', async () => {
        const user = userEvent.setup();
        const document = new JsonDataDocument('data.json', ['old', true], false);
        const view = render(<ScalarHarness accessibleName="name row 1" document={document} location={[0]} />);
        const stringInput = screen.getByRole('textbox', { name: 'name row 1' });

        expect(stringInput.closest('[class*="Mui"]')).toBeNull();
        await user.clear(stringInput);
        await user.type(stringInput, 'new');
        expect(document.getValue()).toEqual(['new', true]);

        view.rerender(<ScalarHarness accessibleName="active row 2" document={document} location={[1]} />);
        await user.click(screen.getByRole('checkbox', { name: 'active row 2' }));
        expect(document.getValue()).toEqual(['new', false]);
        expect(screen.getByText('false')).toBeInTheDocument();
    });

    it('keeps number drafts out of document data and supports Enter, blur validation, and Escape', async () => {
        const user = userEvent.setup();
        const document = new JsonDataDocument('data.json', [2], false);
        render(<ScalarHarness accessibleName="count row 1" document={document} location={[0]} />);
        const input = screen.getByRole('textbox', { name: 'count row 1' });

        await user.clear(input);
        await user.type(input, '-1.25e2');
        expect(document.getValue()).toEqual([2]);
        await user.keyboard('{Enter}');
        expect(document.getValue()).toEqual([-125]);

        await user.clear(input);
        await user.type(input, '01');
        await user.tab();
        expect(document.getValue()).toEqual([-125]);
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByText('Enter a valid JSON number')).toBeInTheDocument();

        await user.click(input);
        await user.keyboard('{Escape}');
        expect(input).toHaveValue('-125');
    });

    it('keeps null read-only, disables writable controls in read-only documents, and supports missing-field callbacks', () => {
        const readOnlyDocument = new JsonDataDocument('data.json', ['locked', null], true);
        const view = render(<ScalarHarness accessibleName="value row 1" document={readOnlyDocument} location={[0]} />);

        expect(screen.getByRole('textbox', { name: 'value row 1' })).toBeDisabled();
        view.rerender(<ScalarHarness accessibleName="value row 2" document={readOnlyDocument} location={[1]} />);
        expect(screen.getByRole('textbox', { name: 'value row 2' })).toHaveAttribute('readonly');
        expect(screen.getByRole('textbox', { name: 'value row 2' })).toHaveValue('null');

        const onChange = vi.fn();
        const editableDocument = new JsonDataDocument('data.json', [{}], false);
        view.rerender(
            <JsonArrayScalarEditor
                accessibleName="name row 1"
                document={editableDocument}
                location={[0, 'name']}
                onChange={onChange}
                value=""
            />,
        );
        fireEvent.change(screen.getByRole('textbox', { name: 'name row 1' }), { target: { value: 'first' } });
        expect(onChange).toHaveBeenCalledWith('first');
    });
});
