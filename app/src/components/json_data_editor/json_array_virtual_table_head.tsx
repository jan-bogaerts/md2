import { TableHead } from '@mui/material';
import { forwardRef, type CSSProperties, type ReactNode } from 'react';

interface JsonArrayVirtualTableHeadProps {
    children?: ReactNode;
    context: unknown;
    style?: CSSProperties;
}

/** Supplies MUI's header context while retaining Virtuoso's sticky positioning. */
export const JsonArrayVirtualTableHead = forwardRef<HTMLTableSectionElement, JsonArrayVirtualTableHeadProps>(
    function JsonArrayVirtualTableHead(props, ref) {
        const { children, style } = props;

        return <TableHead ref={ref} style={style}>{children}</TableHead>;
    },
);
