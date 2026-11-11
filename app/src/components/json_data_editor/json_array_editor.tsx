import {
    Box, TableCell, TableRow, Typography,
} from '@mui/material';
import { useMemo, type ReactNode } from 'react';
import {
    TableVirtuoso, type ScrollSeekConfiguration, type TableComponents, type TableVirtuosoProps,
} from 'react-virtuoso';
import { JSON_ARRAY_DEFAULT_COLUMN_WIDTH, type JsonDataDocument } from '../../services/json/json_data_document';
import { isJsonObject, isJsonPrimitive, type JsonLocationSegment, type JsonValue } from '../../services/json/json_types';
import { JsonArrayActionsFooter } from './json_array_actions_footer';
import { JsonArrayColumnHeaderCell } from './json_array_column_header_cell';
import { JsonArrayScalarEditor } from './json_array_scalar_editor';
import { JsonArrayScrollSeekRow } from './json_array_scroll_seek_row';
import { JsonArrayVirtualTable } from './json_array_virtual_table';
import { JsonArrayVirtualTableHead } from './json_array_virtual_table_head';

const JSON_ARRAY_ESTIMATED_ROW_HEIGHT = 53;
const JSON_ARRAY_OVERSCAN = 106;
const JSON_ARRAY_SCROLL_SEEK_ENTER_VELOCITY = 200;
const JSON_ARRAY_SCROLL_SEEK_EXIT_VELOCITY = 30;
const JSON_ARRAY_SELECTION_COLUMN_WIDTH = 48;

const JSON_ARRAY_SCROLL_SEEK_CONFIGURATION: ScrollSeekConfiguration = {
    enter: (velocity) => Math.abs(velocity) > JSON_ARRAY_SCROLL_SEEK_ENTER_VELOCITY,
    exit: (velocity) => Math.abs(velocity) < JSON_ARRAY_SCROLL_SEEK_EXIT_VELOCITY,
};

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
    ScrollSeekPlaceholder: JsonArrayScrollSeekRow,
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
    const cellClassName = `json-array-body-cell${selected ? ' json-array-body-cell-selected' : ''}`;
    const handleSelection = () => {
        const nextSelection = new Set(selectedRows);
        if (selected) nextSelection.delete(rowIndex);
        else nextSelection.add(rowIndex);
        document.setSelectedRows([...nextSelection]);
    };

    return (
        <>
            <td className={`${cellClassName} json-array-selection-cell`} style={{ width: JSON_ARRAY_SELECTION_COLUMN_WIDTH }}>
                <input
                    aria-label={`Select row ${rowIndex + 1}`}
                    checked={selected}
                    className="json-array-checkbox"
                    onChange={handleSelection}
                    type="checkbox"
                />
            </td>
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
                    <td className={cellClassName} key={`${rowIndex}:${column}`} style={{ width }}>
                        {!fieldPresent ? (
                            <JsonArrayScalarEditor
                                accessibleName={accessibleName}
                                document={document}
                                location={fieldLocation}
                                onChange={handleMissingChange}
                                value=""
                            />
                        ) : isJsonPrimitive(fieldValue) ? (
                            <JsonArrayScalarEditor
                                accessibleName={accessibleName}
                                document={document}
                                location={fieldLocation}
                                value={fieldValue}
                            />
                        ) : (
                            <button aria-label={`Open ${accessibleName}`} className="json-array-open-button" onClick={handleOpen} type="button">
                                Open
                            </button>
                        )}
                    </td>
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
        <Box
            sx={{
                display: 'flex',
                flex: 1,
                flexDirection: 'column',
                minHeight: 0,
                '& .json-array-body-cell': {
                    bgcolor: 'background.paper',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    boxSizing: 'border-box',
                    height: JSON_ARRAY_ESTIMATED_ROW_HEIGHT,
                    overflow: 'hidden',
                    px: 2,
                    py: 0.75,
                    verticalAlign: 'middle',
                },
                '& .json-array-body-cell-selected': { bgcolor: 'action.selected' },
                '& .json-array-selection-cell': { px: 1.5, textAlign: 'center' },
                '& .json-array-input': {
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'custom.borderStrong',
                    borderRadius: 1,
                    boxSizing: 'border-box',
                    color: 'text.primary',
                    font: 'inherit',
                    height: 40,
                    minWidth: 0,
                    px: 1,
                    width: '100%',
                    '&:hover:not(:disabled):not(:read-only)': { borderColor: 'custom.borderHover' },
                    '&:focus-visible': {
                        borderColor: 'primary.main',
                        boxShadow: (theme) => `0 0 0 3px ${theme.palette.custom.primaryBg}`,
                        outline: 'none',
                    },
                    '&:disabled': { bgcolor: 'action.disabledBackground', color: 'text.disabled' },
                },
                '& .json-array-input-error': { borderColor: 'error.main' },
                '& .json-array-number-control': { minWidth: 0, width: '100%' },
                '& .json-array-input-helper': {
                    color: 'error.main',
                    display: 'block',
                    fontSize: (theme) => theme.typography.caption.fontSize,
                    lineHeight: (theme) => theme.typography.caption.lineHeight,
                },
                '& .json-array-boolean-control': {
                    alignItems: 'center',
                    color: 'text.primary',
                    display: 'flex',
                    font: 'inherit',
                    gap: 1,
                    height: 40,
                },
                '& .json-array-checkbox': {
                    accentColor: (theme) => theme.palette.primary.main,
                    height: 18,
                    margin: 0,
                    width: 18,
                },
                '& .json-array-open-button': {
                    bgcolor: 'transparent',
                    border: 0,
                    color: 'primary.main',
                    cursor: 'pointer',
                    font: 'inherit',
                    p: 0,
                    textDecoration: 'underline',
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                },
            }}
        >
            <TableVirtuoso
                components={JSON_ARRAY_TABLE_COMPONENTS}
                context={tableContext}
                data={value}
                defaultItemHeight={JSON_ARRAY_ESTIMATED_ROW_HEIGHT}
                fixedHeaderContent={fixedHeaderContent}
                itemContent={renderRow}
                overscan={JSON_ARRAY_OVERSCAN}
                scrollSeekConfiguration={JSON_ARRAY_SCROLL_SEEK_CONFIGURATION}
                style={{ flex: 1, height: '100%', minHeight: 0, width: '100%' }}
            />
            <JsonArrayActionsFooter document={document} />
        </Box>
    );
}
