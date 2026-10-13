import type { DiagramEditSessionReadAdapter } from '../../../services/diagrams/diagram_edit_session_read_adapter';
import { useCallback, useSyncExternalStore } from 'react';
import type { DiagramFlowPreset, DiagramType } from '../../../services/diagrams/diagram_data';
import {
    diagramEdgeDrawingService,
    type DiagramEdgeDrawingService,
} from '../../../services/diagrams/diagram_edge_drawing_service';
import {
    diagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service';
import { DiagramToolboxButton } from './diagram_toolbox_button';
import { useActiveDiagramTool } from '../editing/use_diagram_tool';

export interface DiagramEntityRelationshipSession {
    read: Pick<DiagramEditSessionReadAdapter, 'getActiveToolSnapshot' | 'subscribeActiveTool' | 'subscribeSession'> & { getMetadataFieldSnapshot: (field: 'preset' | 'type') => DiagramFlowPreset | DiagramType | null | undefined; subscribeMetadataField: (field: 'type', listener: () => void) => () => void };
}

export type DiagramEntityRelationshipDrawing = Pick<DiagramEdgeDrawingService, 'activate'>;

interface DiagramEntityRelationshipButtonProps {
    drawing?: DiagramEntityRelationshipDrawing;
    session?: DiagramEntityRelationshipSession;
}

function useEntityDiagram(session: DiagramEntityRelationshipSession) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeType = session.read.subscribeMetadataField('type', listener);
        const unsubscribeSession = session.read.subscribeSession(listener);

        return () => {
            unsubscribeType();
            unsubscribeSession();
        };
    }, [session]);
    const getSnapshot = useCallback(() => session.read.getMetadataFieldSnapshot('type') === 'entity', [session]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Activates entity relationship drawing only for entity diagrams. */
export function DiagramEntityRelationshipButton({
    drawing = diagramEdgeDrawingService,
    session = diagramEditSessionService,
}: DiagramEntityRelationshipButtonProps) {
    const available = useEntityDiagram(session);
    const activeTool = useActiveDiagramTool(session, 'edge:relationship');
    const handleActivate = useCallback(() => {
        drawing.activate({ kind: 'relationship' });
    }, [drawing]);

    if (!available) return null;

    return (
        <DiagramToolboxButton
            active={activeTool}
            label="Relationship"
            onActivate={handleActivate}
            tooltip="Draw relationship edge"
        />
    );
}
