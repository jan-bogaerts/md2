import { Typography } from '@mui/material';
import { useCallback, useSyncExternalStore } from 'react';
import type { DiagramViewService } from '../../../services/diagrams/diagram_view_service';

export type DiagramCurrentSubtitleService = Pick<DiagramViewService, 'getCurrentDiagramSnapshot' | 'subscribeCurrentDiagram'>;

/** Read-only subtitle of the active Current diagram, shown below the breadcrumbs. */
export function DiagramCurrentSubtitle({ service }: { service: DiagramCurrentSubtitleService }) {
    const getSnapshot = useCallback(() => service.getCurrentDiagramSnapshot()?.meta.description ?? '', [service]);
    const subtitle = useSyncExternalStore(service.subscribeCurrentDiagram, getSnapshot, getSnapshot);

    return (
        <Typography aria-label="Diagram subtitle" color="text.secondary" noWrap variant="body2">
            {subtitle}
        </Typography>
    );
}
