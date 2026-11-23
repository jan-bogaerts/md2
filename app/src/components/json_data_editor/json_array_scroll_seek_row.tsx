import type { ScrollSeekPlaceholderProps } from 'react-virtuoso';

interface JsonArrayScrollSeekRowProps extends ScrollSeekPlaceholderProps {
    context: { columns: readonly unknown[] };
}

/** Lightweight measured row shown while Virtuoso advances through the array quickly. */
export function JsonArrayScrollSeekRow({ context, height }: JsonArrayScrollSeekRowProps) {
    return (
        <tr aria-hidden="true" style={{ height }}>
            <td colSpan={context.columns.length + 1} style={{ border: 0, height, padding: 0 }} />
        </tr>
    );
}
