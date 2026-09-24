import { useCallback } from 'react';
import {
    DiagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service';
import type {
    DiagramPersistentTool,
} from '../../../services/diagrams/diagram_edit_types';
import { diagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service';
import { DiagramToolboxButton } from './diagram_toolbox_button';
import { useActiveDiagramTool } from '../editing/use_diagram_tool';

interface DiagramToolboxToolButtonProps {
    label: string;
    session?: Pick<DiagramEditSessionService, 'getActiveToolSnapshot' | 'setActiveTool' | 'subscribeActiveTool'>;
    tool: DiagramPersistentTool;
    tooltip: string;
}

/** Persistent diagram mode button bound only to active tool state. */
export function DiagramToolboxToolButton({
    label,
    session = diagramEditSessionService,
    tool,
    tooltip,
}: DiagramToolboxToolButtonProps) {
    const activeTool = useActiveDiagramTool(session, tool);
    const handleActivate = useCallback(() => session.setActiveTool(tool), [session, tool]);

    return (
        <DiagramToolboxButton
            active={activeTool}
            label={label}
            onActivate={handleActivate}
            tooltip={tooltip}
        />
    );
}
