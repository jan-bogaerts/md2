import { Box } from '@mui/material';
import { useCallback, useEffect, type ReactNode } from 'react';
import type { ActionInputLayoutStore } from './action_input_layout_store';

/** Measures only the space left for resizable regions, after popup header and controls. */
export function ActionLayoutSurface({ children, store }: { children: ReactNode; store: ActionInputLayoutStore }) {
    const handleSurface = useCallback((surface: HTMLElement | null) => {
        store.attachContainer(surface);
    }, [store]);
    useEffect(() => store.dispose, [store]);
    return (
        <Box
            data-testid="action-layout-regions"
            ref={handleSurface}
            sx={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 1, minHeight: 0, overflow: 'auto' }}
        >
            {children}
        </Box>
    );
}
