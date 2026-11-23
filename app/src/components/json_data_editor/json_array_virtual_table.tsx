import { Table } from '@mui/material';
import type { CSSProperties, ReactNode } from 'react';

interface JsonArrayVirtualTableProps {
    children?: ReactNode;
    context: { rowCount: number; tableWidth: number };
    style?: CSSProperties;
}

/** MUI table surface used by the virtualized JSON array. */
export function JsonArrayVirtualTable(props: JsonArrayVirtualTableProps) {
    const { children, context, style } = props;

    return (
        <Table
            aria-label="JSON array"
            aria-rowcount={context.rowCount + 1}
            size="small"
            stickyHeader
            style={{ ...style, tableLayout: 'fixed', width: context.tableWidth }}
        >
            {children}
        </Table>
    );
}
