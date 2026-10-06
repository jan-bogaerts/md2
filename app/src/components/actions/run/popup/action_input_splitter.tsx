import { Box } from '@mui/material';
import { useSyncExternalStore, type KeyboardEvent, type PointerEvent } from 'react';
import type { ActionInputLayoutStore } from './action_input_layout_store';

/** Accessible separator; action components decide where it sits relative to input. */
export function ActionInputSplitter({ store }: { store: ActionInputLayoutStore }) {
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    const disabled = snapshot.empty && !snapshot.hasQuestions;
    const label = store.kind === 'command' ? 'Resize command input'
        : snapshot.hasQuestions ? 'Resize prompt and questions' : 'Resize prompt';
    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if (disabled) return;
        event.preventDefault();
        store.beginResize(event.clientY);
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => store.moveResize(event.clientY);
    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        store.finishResize();
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (store.resizeByKey(event.key)) event.preventDefault();
    };

    return (
        <Box
            aria-disabled={disabled ? 'true' : undefined}
            aria-label={label}
            aria-orientation="horizontal"
            aria-valuemax={Math.round(snapshot.maximum)}
            aria-valuemin={Math.round(snapshot.minimum)}
            aria-valuenow={Math.round(snapshot.value)}
            onKeyDown={handleKeyDown}
            onLostPointerCapture={store.finishResize}
            onPointerCancel={handlePointerUp}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            role="separator"
            sx={{
                bgcolor: snapshot.resizing && !disabled ? 'primary.main' : 'divider',
                cursor: disabled ? 'default' : 'row-resize', flexShrink: 0, height: '3px',
                touchAction: 'none', width: '100%',
                '&:hover, &:focus-visible': { bgcolor: disabled ? 'divider' : 'primary.main' },
            }}
            tabIndex={disabled ? -1 : 0}
        />
    );
}
