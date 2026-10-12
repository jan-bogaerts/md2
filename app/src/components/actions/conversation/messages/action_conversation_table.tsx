import { Box } from '@mui/material';
import type { ComponentProps } from 'react';

/** Renders a Markdown table that keeps whole words per cell and scrolls horizontally when wider than the message. */
export function ActionConversationTable({ children }: ComponentProps<'table'>) {
    return (
        <Box sx={{
            maxWidth: '100%',
            minWidth: 0,
            overflowX: 'auto',
            '& th, & td': { overflowWrap: 'break-word' },
        }}>
            <table>{children}</table>
        </Box>
    );
}
