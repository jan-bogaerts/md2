import { Box, Typography } from '@mui/material';
import { useSyncExternalStore } from 'react';
import type { JsonDataDocument } from '../../services/json/json_data_document';
import { isJsonObject, isJsonPrimitive } from '../../services/json/json_types';
import { JsonArrayEditor } from './json_array_editor';
import { JsonBreadcrumbs } from './json_breadcrumbs';
import { JsonObjectEditor } from './json_object_editor';
import { JsonScalarEditor } from './json_scalar_editor';

interface JsonDataEditorProps {
    document: JsonDataDocument;
}

/** Standalone renderer for one service-owned JSON document. */
export function JsonDataEditor({ document }: JsonDataEditorProps) {
    const snapshot = useSyncExternalStore(document.subscribe, document.getSnapshot, document.getSnapshot);
    const value = document.getValue();
    const handleNavigate = (depth: number) => document.navigateTo(depth);

    return (
        <Box
            aria-label="JSON data editor"
            component="section"
            sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, minWidth: 0 }}
        >
            {snapshot.unavailableReason ? (
                <Box sx={{ p: 2 }}>
                    <Typography color="error">{snapshot.unavailableReason}</Typography>
                </Box>
            ) : (
                <>
                    <JsonBreadcrumbs location={snapshot.location} onNavigate={handleNavigate} path={document.path} />
                    <Box sx={{ borderTop: 1, borderColor: 'divider', display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
                        {Array.isArray(value) ? <JsonArrayEditor document={document} value={value} /> : null}
                        {isJsonObject(value) ? <JsonObjectEditor document={document} value={value} /> : null}
                        {isJsonPrimitive(value) ? (
                            <Box sx={{ p: 2 }}>
                                <JsonScalarEditor
                                    accessibleName="JSON value"
                                    document={document}
                                    location={snapshot.location}
                                    value={value}
                                />
                            </Box>
                        ) : null}
                    </Box>
                </>
            )}
        </Box>
    );
}
