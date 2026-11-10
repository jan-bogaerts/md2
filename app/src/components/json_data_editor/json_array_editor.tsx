import {
    Box, Button, Checkbox, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import type { JsonDataDocument } from '../../services/json/json_data_document';
import { isJsonObject, isJsonPrimitive, type JsonValue } from '../../services/json/json_types';
import { copyTextToClipboard, readTextFromClipboard } from '../../services/clipboard_text';
import { dialogService } from '../../services/dialog_service';
import { JsonScalarEditor } from './json_scalar_editor';

interface JsonArrayEditorProps {
    document: JsonDataDocument;
    value: JsonValue[];
}

function objectColumns(rows: JsonValue[]) {
    const columns: string[] = [];
    const seen = new Set<string>();
    rows.forEach((row) => {
        if (!isJsonObject(row)) return;
        Object.keys(row).forEach((key) => {
            if (seen.has(key)) return;
            seen.add(key);
            columns.push(key);
        });
    });

    return columns;
}

function reportClipboardError(error: unknown, fallbackMessage: string) {
    dialogService.error(error, { fallbackMessage });
}

/** Array table with service-owned multi-row selection and ordered row operations. */
export function JsonArrayEditor({ document, value }: JsonArrayEditorProps) {
    const snapshot = document.getSnapshot();
    const selectedRows = new Set(snapshot.selectedRows);
    const objectTable = value.length > 0 && value.every(isJsonObject);
    const columns = objectTable ? objectColumns(value) : ['values'];
    const mutationDisabled = document.readOnly;
    const selectionEmpty = selectedRows.size === 0;
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

    return (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            <Box sx={{ alignItems: 'center', borderBottom: 1, borderColor: 'divider', display: 'flex', flexShrink: 0, gap: 1, p: 1 }}>
                <Button disabled={mutationDisabled} onClick={handleAdd} variant="outlined">Add</Button>
                <Button disabled={mutationDisabled || selectionEmpty} onClick={handleDelete} variant="outlined">Delete</Button>
                <Button disabled={selectionEmpty} onClick={handleCopy} variant="outlined">Copy</Button>
                <Button disabled={mutationDisabled || selectionEmpty} onClick={handleCut} variant="outlined">Cut</Button>
                <Button disabled={mutationDisabled} onClick={handlePaste} variant="outlined">Paste</Button>
            </Box>
            <TableContainer sx={{ flex: 1 }}>
                <Table aria-label="JSON array" size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox"><Typography variant="caption">Select</Typography></TableCell>
                            {columns.map((column) => <TableCell key={column}>{column}</TableCell>)}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {value.map((row, rowIndex) => {
                            const handleSelection = () => {
                                const nextSelection = new Set(selectedRows);
                                if (nextSelection.has(rowIndex)) nextSelection.delete(rowIndex);
                                else nextSelection.add(rowIndex);
                                document.setSelectedRows([...nextSelection]);
                            };

                            return (
                                <TableRow key={rowIndex} selected={selectedRows.has(rowIndex)}>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            checked={selectedRows.has(rowIndex)}
                                            onChange={handleSelection}
                                            slotProps={{ input: { 'aria-label': `Select row ${rowIndex + 1}` } }}
                                        />
                                    </TableCell>
                                    {columns.map((column) => {
                                        const fieldPresent = !objectTable || isJsonObject(row) && Object.hasOwn(row, column);
                                        const fieldValue = objectTable && isJsonObject(row) ? row[column] : row;
                                        const segment = objectTable ? column : rowIndex;
                                        const accessibleName = objectTable ? `${column} row ${rowIndex + 1}` : `Value row ${rowIndex + 1}`;
                                        const fieldLocation = objectTable
                                            ? [...snapshot.location, rowIndex, column]
                                            : [...snapshot.location, rowIndex];
                                        const handleOpen = () => {
                                            document.drillInto(rowIndex);
                                            if (objectTable) document.drillInto(column);
                                        };
                                        const handleMissingChange = (nextValue: JsonValue) => {
                                            const nextRow = { ...(row as { [key: string]: JsonValue }), [column]: nextValue };
                                            document.setValue([...snapshot.location, rowIndex], nextRow, 'json-editor');
                                        };

                                        return (
                                            <TableCell key={`${rowIndex}:${column}`}>
                                                {!fieldPresent ? (
                                                    <JsonScalarEditor
                                                        accessibleName={accessibleName}
                                                        document={document}
                                                        location={fieldLocation}
                                                        onChange={handleMissingChange}
                                                        value=""
                                                    />
                                                ) : isJsonPrimitive(fieldValue) ? (
                                                    <JsonScalarEditor
                                                        accessibleName={accessibleName}
                                                        document={document}
                                                        location={fieldLocation}
                                                        value={fieldValue}
                                                    />
                                                ) : (
                                                    <Button onClick={handleOpen} variant="outlined">
                                                        Open {typeof segment === 'number' ? 'value' : segment}
                                                    </Button>
                                                )}
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
