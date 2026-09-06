import { useCallback, useSyncExternalStore } from 'react';
import {
    diagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service';
import {
    diagramNodePlacementService,
    type DiagramNodePlacementDefinition,
    type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service';
import type { DiagramComponentNodeSession } from './diagram_component_node_button';
import { DiagramToolboxButton } from './diagram_toolbox_button';
import { useActiveDiagramTool } from './use_diagram_tool';

const PARTICIPANT_DEFAULT_HEIGHT = 72;
const PARTICIPANT_DEFAULT_WIDTH = 160;
const PARTICIPANT_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: {
        height: PARTICIPANT_DEFAULT_HEIGHT,
        label: 'New participant',
        role: 'focal',
        width: PARTICIPANT_DEFAULT_WIDTH,
    },
    kind: 'participant',
};

export type DiagramParticipantButtonSession = DiagramComponentNodeSession;

interface DiagramParticipantButtonProps {
    placement?: Pick<DiagramNodePlacementService, 'activate'>;
    session?: DiagramParticipantButtonSession;
}

/** Sequence-only participant placement tool bound to diagram type and active tool state. */
export function DiagramParticipantButton({
    placement = diagramNodePlacementService,
    session = diagramEditSessionService,
}: DiagramParticipantButtonProps) {
    const subscribeDiagramType = useCallback((listener: () => void) => {
        const unsubscribeMetadata = session.subscribeMetadataField('type', listener);
        const unsubscribeSession = session.subscribeSession(listener);

        return () => {
            unsubscribeMetadata();
            unsubscribeSession();
        };
    }, [session]);
    const getDiagramType = useCallback(() => session.getMetadataFieldSnapshot('type'), [session]);
    const diagramType = useSyncExternalStore(subscribeDiagramType, getDiagramType, getDiagramType);
    const activeTool = useActiveDiagramTool(session, 'node:participant');
    const handleActivate = useCallback(() => {
        placement.activate(PARTICIPANT_DEFINITION);
    }, [placement]);

    if (diagramType !== 'sequence') return null;

    return (
        <DiagramToolboxButton
            active={activeTool}
            label="Participant"
            onActivate={handleActivate}
            tooltip="Place participant"
        />
    );
}
