import { Box, Typography } from '@mui/material';
import { useDndContext } from '@dnd-kit/core';
import { useSyncExternalStore } from 'react';
import { cardSequenceDraftService } from './card_sequence_draft_service';
import { cardInternalIdFromSequenceItem } from './card_sequence_dnd';

/** Pointer-following copy of sequence row while source stays in list. */
export function CardSequenceDragOverlay() {
    const { active } = useDndContext();
    const snapshot = useSyncExternalStore(cardSequenceDraftService.subscribe, cardSequenceDraftService.getSnapshot);
    const cardInternalId = active ? cardInternalIdFromSequenceItem(String(active.id)) : null;
    const source = snapshot.cardSources.find((card) => card.cardInternalId === cardInternalId);
    if (!source) return null;

    return (
        <Box
            aria-label={`Dragging ${source.id} in sequence`}
            sx={{
                bgcolor: 'background.paper',
                border: '1px solid',
                borderColor: 'primary.main',
                borderRadius: 1.25,
                boxShadow: 8,
                cursor: 'grabbing',
                px: 2,
                py: 1,
            }}
        >
            <Typography noWrap variant="subtitle2">{source.id} · {source.title}</Typography>
        </Box>
    );
}
