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

export interface DiagramArchitectureEdgeSession {
    getActiveToolSnapshot: () => DiagramPersistentTool;
    getMetadataFieldSnapshot: (field: 'type') => DiagramType | null | undefined;
    subscribeActiveTool: (listener: () => void) => () => void;
    subscribeMetadataField: (field: 'type', listener: () => void) => () => void;
    subscribeSession: (listener: () => void) => () => void;
}

export type DiagramArchitectureEdgeDrawing = Pick<DiagramEdgeDrawingService, 'activate'>;

interface DiagramArchitectureEdgeButtonProps {
    drawing?: DiagramArchitectureEdgeDrawing;
    kind: Extract<DiagramEdgeKind, 'async' | 'connection' | 'data'>;
    label: string;
    session?: DiagramArchitectureEdgeSession;
}

function useDiagramType(session: DiagramArchitectureEdgeSession) {
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

/** Activates one architecture edge kind through shared edge drawing. */
export function DiagramArchitectureEdgeButton({
    drawing = diagramEdgeDrawingService,
    kind,
    label,
    session = diagramEditSessionService,
}: DiagramArchitectureEdgeButtonProps) {
    const diagramType = useDiagramType(session);
    const activeTool = useActiveDiagramTool(session, `edge:${kind}`);
    const handleActivate = useCallback(() => {
        drawing.activate({ kind });
    }, [drawing, kind]);

    if (diagramType !== 'architecture') return null;

    return (
        <DiagramToolboxButton
            active={activeTool}
            label={label}
            onActivate={handleActivate}
            tooltip={`Draw ${label.toLowerCase()} edge`}
        />
    );
}
