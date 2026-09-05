import { useCallback, useSyncExternalStore } from 'react';
import type {
    DiagramEdgeKind,
    DiagramFlowPreset,
    DiagramType,
} from '../../services/diagrams/diagram_data';
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

export interface DiagramFlowEdgeSession {
    getActiveToolSnapshot: () => DiagramPersistentTool;
    getMetadataFieldSnapshot: (field: 'preset' | 'type') => DiagramFlowPreset | DiagramType | null | undefined;
    subscribeActiveTool: (listener: () => void) => () => void;
    subscribeMetadataField: (field: 'preset' | 'type', listener: () => void) => () => void;
    subscribeSession: (listener: () => void) => () => void;
}

export type DiagramFlowEdgeDrawing = Pick<DiagramEdgeDrawingService, 'activate'>;

interface DiagramFlowEdgeButtonProps {
    drawing?: DiagramFlowEdgeDrawing;
    kind: Extract<DiagramEdgeKind, 'flow' | 'transition'>;
    label: string;
    preset: DiagramFlowPreset;
    session?: DiagramFlowEdgeSession;
}

function useFlowPresetAvailability(session: DiagramFlowEdgeSession, preset: DiagramFlowPreset) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribePreset = session.subscribeMetadataField('preset', listener);
        const unsubscribeType = session.subscribeMetadataField('type', listener);
        const unsubscribeSession = session.subscribeSession(listener);

        return () => {
            unsubscribePreset();
            unsubscribeType();
            unsubscribeSession();
        };
    }, [session]);
    const getSnapshot = useCallback(
        () => session.getMetadataFieldSnapshot('type') === 'flow' && session.getMetadataFieldSnapshot('preset') === preset,
        [preset, session],
    );

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Activates one flow edge kind through shared edge drawing, gated on the diagram flow preset. */
export function DiagramFlowEdgeButton({
    drawing = diagramEdgeDrawingService,
    kind,
    label,
    preset,
    session = diagramEditSessionService,
}: DiagramFlowEdgeButtonProps) {
    const available = useFlowPresetAvailability(session, preset);
    const activeTool = useActiveDiagramTool(session);
    const handleActivate = useCallback(() => {
        drawing.activate({ kind });
    }, [drawing, kind]);

    if (!available) return null;

    return (
        <DiagramToolboxButton
            active={activeTool === `edge:${kind}`}
            label={label}
            onActivate={handleActivate}
            tooltip={`Draw ${label.toLowerCase()} edge`}
        />
    );
}
