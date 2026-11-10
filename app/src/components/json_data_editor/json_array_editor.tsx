import {
    Box, Checkbox, Link, TableCell, TableRow, Typography,
} from '@mui/material';
import { useMemo, type ReactNode } from 'react';
import { TableVirtuoso, type TableComponents, type TableVirtuosoProps } from 'react-virtuoso';
import { JSON_ARRAY_DEFAULT_COLUMN_WIDTH, type JsonDataDocument } from '../../services/json/json_data_document';
import { isJsonObject, isJsonPrimitive, type JsonLocationSegment, type JsonValue } from '../../services/json/json_types';
import { JsonScalarEditor } from './json_scalar_editor';
import { JsonArrayActionsFooter } from './json_array_actions_footer';
import { JsonArrayColumnHeaderCell } from './json_array_column_header_cell';
import { JsonArrayVirtualTable } from './json_array_virtual_table';
import { JsonArrayVirtualTableHead } from './json_array_virtual_table_head';

const JSON_ARRAY_ESTIMATED_ROW_HEIGHT = 53;
const JSON_ARRAY_OVERSCAN = 106;
const JSON_ARRAY_SELECTION_COLUMN_WIDTH = 48;

interface JsonArrayEditorProps {
    document: JsonDataDocument;
    value: JsonValue[];
}

interface JsonArrayColumn {
    name: string;
    width: number;
}

interface JsonArrayTableContext {
    columns: JsonArrayColumn[];
    document: JsonDataDocument;
    location: readonly JsonLocationSegment[];
    objectTable: boolean;
    rowCount: number;
    selectedRows: ReadonlySet<number>;
    tableWidth: number;
}

const JSON_ARRAY_TABLE_COMPONENTS: TableComponents<JsonValue, JsonArrayTableContext> = {
    Table: JsonArrayVirtualTable,
    TableHead: JsonArrayVirtualTableHead,
};

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

function renderHeader(columns: JsonArrayColumn[], document: JsonDataDocument) {
    return (
        <TableRow>
            <TableCell padding="checkbox" style={{ width: JSON_ARRAY_SELECTION_COLUMN_WIDTH }} sx={{ bgcolor: 'background.paper', boxSizing: 'border-box' }}>
                <Typography variant="caption">Select</Typography>
            </TableCell>
            {columns.map(({ name, width }) => (
                <JsonArrayColumnHeaderCell column={name} document={document} key={name} width={width} />
            ))}
        </TableRow>
    );
}

function renderRow(rowIndex: number, row: JsonValue, context: JsonArrayTableContext): ReactNode {
    const { columns, document, location, objectTable, selectedRows } = context;
    const selected = selectedRows.has(rowIndex);
    const selectionCellSx = { boxSizing: 'border-box', ...(selected ? { bgcolor: 'action.selected' } : undefined) };
    const cellSx = { ...selectionCellSx, '& .MuiTextField-root': { minWidth: 0, width: '100%' } };
    const handleSelection = () => {
        const nextSelection = new Set(selectedRows);
        if (selected) nextSelection.delete(rowIndex);
        else nextSelection.add(rowIndex);
        document.setSelectedRows([...nextSelection]);
    };

    return (
        <>
            <TableCell padding="checkbox" style={{ width: JSON_ARRAY_SELECTION_COLUMN_WIDTH }} sx={selectionCellSx}>
                <Checkbox
                    checked={selected}
                    onChange={handleSelection}
                    slotProps={{ input: { 'aria-label': `Select row ${rowIndex + 1}` } }}
                />
            </TableCell>
            {columns.map(({ name: column, width }) => {
                const fieldPresent = !objectTable || isJsonObject(row) && Object.hasOwn(row, column);
                const fieldValue = objectTable && isJsonObject(row) ? row[column] : row;
                const accessibleName = objectTable ? `${column} row ${rowIndex + 1}` : `Value row ${rowIndex + 1}`;
                const fieldLocation = objectTable ? [...location, rowIndex, column] : [...location, rowIndex];
                const handleOpen = () => {
                    document.drillInto(rowIndex);
                    if (objectTable) document.drillInto(column);
                };
                const handleMissingChange = (nextValue: JsonValue) => {
                    const nextRow = { ...(row as { [key: string]: JsonValue }), [column]: nextValue };
                    document.setValue([...location, rowIndex], nextRow, 'json-editor');
                };

                return (
                    <TableCell key={`${rowIndex}:${column}`} style={{ width }} sx={cellSx}>
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
                            <Link aria-label={`Open ${accessibleName}`} component="button" onClick={handleOpen} type="button" variant="body2">
                                Open
                            </Link>
                        )}
                    </TableCell>
                );
            })}
        </>
    );
}

/** Array table with service-owned multi-row selection and ordered row operations. */
export function JsonArrayEditor({ document, value }: JsonArrayEditorProps) {
    const snapshot = document.getSnapshot();
    const selectedRows = useMemo(() => new Set(snapshot.selectedRows), [snapshot.selectedRows]);
    const objectTable = useMemo(() => value.length > 0 && value.every(isJsonObject), [value]);
    const columnNames = useMemo(() => objectTable ? objectColumns(value) : ['values'], [objectTable, value]);
    const columns = useMemo<JsonArrayColumn[]>(
        () => columnNames.map((name) => ({ name, width: snapshot.arrayColumnWidths.get(name) ?? JSON_ARRAY_DEFAULT_COLUMN_WIDTH })),
        [columnNames, snapshot.arrayColumnWidths],
    );
    const tableWidth = columns.reduce((total, { width }) => total + width, JSON_ARRAY_SELECTION_COLUMN_WIDTH);
    const tableContext = useMemo<JsonArrayTableContext>(() => ({
        columns,
        document,
        location: snapshot.location,
        objectTable,
        rowCount: value.length,
        selectedRows,
        tableWidth,
    }), [columns, document, objectTable, selectedRows, snapshot.location, tableWidth, value.length]);
    const fixedHeaderContent = useMemo<TableVirtuosoProps<JsonValue, JsonArrayTableContext>['fixedHeaderContent']>(
        () => () => renderHeader(columns, document),
        [columns, document],
    );

    return (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            <TableVirtuoso
                components={JSON_ARRAY_TABLE_COMPONENTS}
                context={tableContext}
                data={value}
                defaultItemHeight={JSON_ARRAY_ESTIMATED_ROW_HEIGHT}
                fixedHeaderContent={fixedHeaderContent}
                itemContent={renderRow}
                overscan={JSON_ARRAY_OVERSCAN}
                style={{ flex: 1, height: '100%', minHeight: 0, width: '100%' }}
            />
            <JsonArrayActionsFooter document={document} />
        </Box>
    );
}
