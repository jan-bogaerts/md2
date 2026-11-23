import { Box } from '@mui/material';
import type { JsonDataDocument } from '../../services/json/json_data_document';
import { JsonDataEditor } from '../json_data_editor/json_data_editor';

interface JsonEditorPaneProps {
    document: JsonDataDocument;
}

/** List-view host for active JSON document. */
export function JsonEditorPane({ document }: JsonEditorPaneProps) {
    return (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, width: '100%' }}>
            <JsonDataEditor document={document} />
        </Box>
    );
}
