import { Box, Button, Typography } from '@mui/material';
import type { JsonDataDocument } from '../../services/json/json_data_document';
import { isJsonPrimitive, type JsonValue } from '../../services/json/json_types';
import { JsonScalarEditor } from './json_scalar_editor';

interface JsonObjectEditorProps {
    document: JsonDataDocument;
    value: { [key: string]: JsonValue };
}

/** Vertically stacked object properties with immutable names. */
export function JsonObjectEditor({ document, value }: JsonObjectEditorProps) {
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 2 }}>
            {Object.entries(value).map(([key, fieldValue]) => {
                const handleOpen = () => document.drillInto(key);
                const location = [...document.getSnapshot().location, key];

                return (
                    <Box key={key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.875 }}>
                        <Typography color="text.secondary" variant="caption">{key}</Typography>
                        {isJsonPrimitive(fieldValue) ? (
                            <JsonScalarEditor
                                accessibleName={key}
                                document={document}
                                location={location}
                                value={fieldValue}
                            />
                        ) : (
                            <Button onClick={handleOpen} variant="outlined">
                                Open {Array.isArray(fieldValue) ? `array (${fieldValue.length})` : 'object'}
                            </Button>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}
