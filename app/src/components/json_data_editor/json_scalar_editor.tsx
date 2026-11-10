import { Checkbox, FormControlLabel, TextField } from '@mui/material';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { JsonDataDocument } from '../../services/json/json_data_document';
import type { JsonLocationSegment, JsonPrimitive } from '../../services/json/json_types';

interface JsonScalarEditorProps {
    accessibleName: string;
    document: JsonDataDocument;
    location: readonly JsonLocationSegment[];
    onChange?: (value: JsonPrimitive) => void;
    value: JsonPrimitive;
}

/** Type-preserving scalar control: edits never change value's JSON type. */
export function JsonScalarEditor(props: JsonScalarEditorProps) {
    const { accessibleName, document, location, onChange, value } = props;
    const updateValue = (nextValue: JsonPrimitive) => {
        if (onChange) {
            onChange(nextValue);
            return;
        }
        document.setValue(location, nextValue, 'json-editor');
    };

    if (typeof value === 'boolean') {
        const handleBooleanChange = (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
            updateValue(checked);
        };

        return (
            <FormControlLabel
                disabled={document.readOnly}
                control={<Checkbox checked={value} onChange={handleBooleanChange} slotProps={{ input: { 'aria-label': accessibleName } }} />}
                label={String(value)}
            />
        );
    }

    if (typeof value === 'number') {
        const input = document.getNumberInput(location, value);
        const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
            document.setNumberInput(location, event.target.value);
        };
        const handleNumberBlur = () => {
            document.commitNumberInput(location, 'json-editor');
        };
        const handleNumberKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
                document.commitNumberInput(location, 'json-editor');
                return;
            }
            if (event.key === 'Escape') document.resetNumberInput(location);
        };

        return (
            <TextField
                disabled={document.readOnly}
                error={input.invalid}
                helperText={input.invalid ? 'Enter a valid JSON number' : undefined}
                onBlur={handleNumberBlur}
                onChange={handleNumberChange}
                onKeyDown={handleNumberKeyDown}
                size="small"
                slotProps={{ htmlInput: { 'aria-label': accessibleName, inputMode: 'decimal' } }}
                value={input.text}
            />
        );
    }

    if (value === null) {
        return (
            <TextField
                size="small"
                slotProps={{ htmlInput: { 'aria-label': accessibleName, readOnly: true } }}
                value="null"
            />
        );
    }

    const handleStringChange = (event: ChangeEvent<HTMLInputElement>) => {
        updateValue(event.target.value);
    };

    return (
        <TextField
            disabled={document.readOnly}
            onChange={handleStringChange}
            size="small"
            slotProps={{ htmlInput: { 'aria-label': accessibleName } }}
            value={value}
        />
    );
}
