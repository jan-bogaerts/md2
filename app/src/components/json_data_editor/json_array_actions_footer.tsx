import AddOutlined from '@mui/icons-material/AddOutlined';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import ContentCutOutlined from '@mui/icons-material/ContentCutOutlined';
import ContentPasteOutlined from '@mui/icons-material/ContentPasteOutlined';
import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import { Box, IconButton, Tooltip } from '@mui/material';
import { useSyncExternalStore } from 'react';
import type { JsonDataDocument } from '../../services/json/json_data_document';
import { copyTextToClipboard, readTextFromClipboard } from '../../services/clipboard_text';
import { dialogService } from '../../services/dialog_service';

interface JsonArrayActionsFooterProps {
    document: JsonDataDocument;
}

function reportClipboardError(error: unknown, fallbackMessage: string) {
    dialogService.error(error, { fallbackMessage });
}

/** Footer bar with the row operations for the JSON array currently shown. */
export function JsonArrayActionsFooter({ document }: JsonArrayActionsFooterProps) {
    const { selectedRows } = useSyncExternalStore(document.subscribe, document.getSnapshot, document.getSnapshot);
    const mutationDisabled = document.readOnly;
    const selectionEmpty = selectedRows.length === 0;
    const handleAdd = () => document.addRow('json-editor');
    const handleDelete = () => document.deleteSelectedRows('json-editor');
    const handleCopy = async () => {
        try {
            await document.copySelectedRows(copyTextToClipboard);
        } catch (error) {
            reportClipboardError(error, 'JSON rows could not be copied');
        }
    };
    const handleCut = async () => {
        try {
            await document.cutSelectedRows(copyTextToClipboard, 'json-editor');
        } catch (error) {
            reportClipboardError(error, 'JSON rows could not be cut');
        }
    };
    const handlePaste = async () => {
        try {
            document.pasteRows(await readTextFromClipboard(), 'json-editor');
        } catch (error) {
            reportClipboardError(error, 'JSON rows could not be pasted');
        }
    };
    const actions = [
        { color: 'default', disabled: mutationDisabled, icon: <AddOutlined />, label: 'Add', onClick: handleAdd },
        { color: 'error', disabled: mutationDisabled || selectionEmpty, icon: <DeleteOutlined />, label: 'Delete', onClick: handleDelete },
        { color: 'default', disabled: selectionEmpty, icon: <ContentCopyOutlined />, label: 'Copy', onClick: handleCopy },
        { color: 'default', disabled: mutationDisabled || selectionEmpty, icon: <ContentCutOutlined />, label: 'Cut', onClick: handleCut },
        { color: 'default', disabled: mutationDisabled, icon: <ContentPasteOutlined />, label: 'Paste', onClick: handlePaste },
    ] as const;

    return (
        <Box
            aria-label="List actions"
            role="toolbar"
            sx={{ alignItems: 'center', backgroundColor: 'background.default', borderTop: 1, borderColor: 'divider', display: 'flex', flexShrink: 0, gap: 1, minWidth: 0, px: 2, py: 1.5 }}
        >
            {actions.map(({ color, disabled, icon, label, onClick }) => (
                <Tooltip key={label} title={label}>
                    <span>
                        <IconButton aria-label={label} color={color} disabled={disabled} onClick={onClick}>
                            {icon}
                        </IconButton>
                    </span>
                </Tooltip>
            ))}
        </Box>
    );
}
