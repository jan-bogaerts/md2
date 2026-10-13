import type { DiagramEditSessionReadAdapter } from '../../../services/diagrams/diagram_edit_session_read_adapter';
import { useCallback, useSyncExternalStore } from 'react';
import type { DiagramEdgeKind, DiagramFlowPreset, DiagramType } from '../../../services/diagrams/diagram_data';
import {
    diagramEdgeDrawingService,
    type DiagramEdgeDrawingService,
} from '../../../services/diagrams/diagram_edge_drawing_service';
import {
    diagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service';
import { DiagramToolboxButton } from './diagram_toolbox_button';
import { useActiveDiagramTool } from '../editing/use_diagram_tool';

export interface DiagramSequenceEdgeSession {
    read: Pick<DiagramEditSessionReadAdapter, 'getActiveToolSnapshot' | 'subscribeActiveTool' | 'subscribeSession'> & { getMetadataFieldSnapshot: (field: 'preset' | 'type') => DiagramFlowPreset | DiagramType | null | undefined; subscribeMetadataField: (field: 'type', listener: () => void) => () => void };
}

export type DiagramSequenceEdgeDrawing = Pick<DiagramEdgeDrawingService, 'activate'>;

interface DiagramSequenceEdgeButtonProps {
    drawing?: DiagramSequenceEdgeDrawing;
    kind: Extract<DiagramEdgeKind, 'async' | 'call' | 'return' | 'success'>;
    label: string;
    session?: DiagramSequenceEdgeSession;
}

function useDiagramType(session: DiagramSequenceEdgeSession) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeType = session.read.subscribeMetadataField('type', listener);
        const unsubscribeSession = session.read.subscribeSession(listener);

        return () => {
            unsubscribeType();
            unsubscribeSession();
        };
    }, [session]);
    const getSnapshot = useCallback(() => session.read.getMetadataFieldSnapshot('type'), [session]);

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Activates one sequence message kind through shared edge drawing. */
export function DiagramSequenceEdgeButton({
    drawing = diagramEdgeDrawingService,
    kind,
    label,
    session = diagramEditSessionService,
}: DiagramSequenceEdgeButtonProps) {
    const diagramType = useDiagramType(session);
    const activeTool = useActiveDiagramTool(session, `edge:${kind}`);
    const handleActivate = useCallback(() => {
        drawing.activate({ kind });
    }, [drawing, kind]);

    if (diagramType !== 'sequence') return null;

    return (
        <DiagramToolboxButton
            active={activeTool}
            label={label}
            onActivate={handleActivate}
            tooltip={`Draw ${label.toLowerCase()} message`}
        />
    );
}
