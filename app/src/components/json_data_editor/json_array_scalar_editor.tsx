import { useId, type ChangeEvent, type KeyboardEvent } from 'react';
import type { JsonDataDocument } from '../../services/json/json_data_document';
import type { JsonLocationSegment, JsonPrimitive } from '../../services/json/json_types';

interface JsonArrayScalarEditorProps {
    accessibleName: string;
    document: JsonDataDocument;
    location: readonly JsonLocationSegment[];
    onChange?: (value: JsonPrimitive) => void;
    value: JsonPrimitive;
}

/** Native scalar controls for virtualized array rows. */
export function JsonArrayScalarEditor(props: JsonArrayScalarEditorProps) {
    const { accessibleName, document, location, onChange, value } = props;
    const errorId = useId();
    const updateValue = (nextValue: JsonPrimitive) => {
        if (onChange) {
            onChange(nextValue);
            return;
        }
        document.setValue(location, nextValue, 'json-editor');
    };

    if (typeof value === 'boolean') {
        const handleBooleanChange = (event: ChangeEvent<HTMLInputElement>) => updateValue(event.target.checked);

        return (
            <label className="json-array-boolean-control">
                <input
                    aria-label={accessibleName}
                    checked={value}
                    className="json-array-checkbox"
                    disabled={document.readOnly}
                    onChange={handleBooleanChange}
                    type="checkbox"
                />
                <span>{String(value)}</span>
            </label>
        );
    }

    if (typeof value === 'number') {
        const input = document.getNumberInput(location, value);
        const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => document.setNumberInput(location, event.target.value);
        const handleNumberBlur = () => document.commitNumberInput(location, 'json-editor');
        const handleNumberKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
                document.commitNumberInput(location, 'json-editor');
                return;
            }
            if (event.key === 'Escape') document.resetNumberInput(location);
        };

        return (
            <div className="json-array-number-control">
                <input
                    aria-describedby={input.invalid ? errorId : undefined}
                    aria-invalid={input.invalid}
                    aria-label={accessibleName}
                    className={`json-array-input${input.invalid ? ' json-array-input-error' : ''}`}
                    disabled={document.readOnly}
                    inputMode="decimal"
                    onBlur={handleNumberBlur}
                    onChange={handleNumberChange}
                    onKeyDown={handleNumberKeyDown}
                    type="text"
                    value={input.text}
                />
                {input.invalid ? <span className="json-array-input-helper" id={errorId}>Enter a valid JSON number</span> : null}
            </div>
        );
    }

    if (value === null) {
        return <input aria-label={accessibleName} className="json-array-input" readOnly type="text" value="null" />;
    }

    const handleStringChange = (event: ChangeEvent<HTMLInputElement>) => updateValue(event.target.value);

    return (
        <input
            aria-label={accessibleName}
            className="json-array-input"
            disabled={document.readOnly}
            onChange={handleStringChange}
            type="text"
            value={value}
        />
    );
}
