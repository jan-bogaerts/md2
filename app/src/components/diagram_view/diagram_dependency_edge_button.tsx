import { useCallback, useSyncExternalStore } from 'react';
import type { DiagramEdgeKind, DiagramType } from '../../services/diagrams/diagram_data';
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

export interface DiagramDependencyEdgeSession {
    getActiveToolSnapshot: () => DiagramPersistentTool;
    getMetadataFieldSnapshot: (field: 'type') => DiagramType | null | undefined;
    subscribeActiveTool: (listener: () => void) => () => void;
    subscribeMetadataField: (field: 'type', listener: () => void) => () => void;
    subscribeSession: (listener: () => void) => () => void;
}

export type DiagramDependencyEdgeDrawing = Pick<DiagramEdgeDrawingService, 'activate'>;

interface DiagramDependencyEdgeButtonProps {
    drawing?: DiagramDependencyEdgeDrawing;
    kind: Extract<DiagramEdgeKind, 'cycle' | 'dependency'>;
    label: string;
    session?: DiagramDependencyEdgeSession;
}

function useDiagramType(session: DiagramDependencyEdgeSession) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeType = session.subscribeMetadataField('type', listener);
        const unsubscribeSession = session.subscribeSession(listener);

        return () => {
            unsubscribeType();
            unsubscribeSession();
        };
    }, [session]);
    const getSnapshot = useCallback(() => session.getMetadataFieldSnapshot('type'), [session]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Activates one dependency edge kind through shared edge drawing. */
export function DiagramDependencyEdgeButton({
    drawing = diagramEdgeDrawingService,
    kind,
    label,
    session = diagramEditSessionService,
}: DiagramDependencyEdgeButtonProps) {
    const diagramType = useDiagramType(session);
    const activeTool = useActiveDiagramTool(session);
    const handleActivate = useCallback(() => {
        drawing.activate({ kind });
    }, [drawing, kind]);

    if (diagramType !== 'dependency') return null;

    return (
        <DiagramToolboxButton
            active={activeTool === `edge:${kind}`}
            label={label}
            onActivate={handleActivate}
            tooltip={`Draw ${label.toLowerCase()} edge`}
        />
    );
}
