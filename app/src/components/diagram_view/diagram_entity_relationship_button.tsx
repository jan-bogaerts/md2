import { useCallback, useSyncExternalStore } from 'react';
import type { DiagramType } from '../../services/diagrams/diagram_data';
import {
    diagramEdgeDrawingService,
    type DiagramEdgeDrawingService,
} from '../../services/diagrams/diagram_edge_drawing_service';
import {
    diagramEditSessionService,
    type DiagramPersistentTool,
} from '../../services/diagrams/diagram_edit_session_service';
import { DiagramToolboxButton } from './diagram_toolbox_button';
import { useActiveDiagramTool } from './use_diagram_tool';

export interface DiagramEntityRelationshipSession {
    getActiveToolSnapshot: () => DiagramPersistentTool;
    getMetadataFieldSnapshot: (field: 'type') => DiagramType | null | undefined;
    subscribeActiveTool: (listener: () => void) => () => void;
    subscribeMetadataField: (field: 'type', listener: () => void) => () => void;
    subscribeSession: (listener: () => void) => () => void;
}

export type DiagramEntityRelationshipDrawing = Pick<DiagramEdgeDrawingService, 'activate'>;

interface DiagramEntityRelationshipButtonProps {
    drawing?: DiagramEntityRelationshipDrawing;
    session?: DiagramEntityRelationshipSession;
}

function useEntityDiagram(session: DiagramEntityRelationshipSession) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeType = session.subscribeMetadataField('type', listener);
        const unsubscribeSession = session.subscribeSession(listener);

        return () => {
            unsubscribeType();
            unsubscribeSession();
        };
    }, [session]);
    const getSnapshot = useCallback(() => session.getMetadataFieldSnapshot('type') === 'entity', [session]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Activates entity relationship drawing only for entity diagrams. */
export function DiagramEntityRelationshipButton({
    drawing = diagramEdgeDrawingService,
    session = diagramEditSessionService,
}: DiagramEntityRelationshipButtonProps) {
    const available = useEntityDiagram(session);
    const activeTool = useActiveDiagramTool(session);
    const handleActivate = useCallback(() => {
        drawing.activate({ kind: 'relationship' });
    }, [drawing]);

    if (!available) return null;

    return (
        <DiagramToolboxButton
            active={activeTool === 'edge:relationship'}
            label="Relationship"
            onActivate={handleActivate}
            tooltip="Draw relationship edge"
        />
    );
}
