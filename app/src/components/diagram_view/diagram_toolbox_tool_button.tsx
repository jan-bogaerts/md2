import { useCallback } from 'react';
import type {
    DiagramPersistentTool,
    DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service';
import { diagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service';
import { DiagramToolboxButton } from './diagram_toolbox_button';
import { useActiveDiagramTool } from './use_diagram_tool';

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
    const activeTool = useActiveDiagramTool(session);
    const handleActivate = useCallback(() => session.setActiveTool(tool), [session, tool]);

    return (
        <DiagramToolboxButton
            active={activeTool === tool}
            label={label}
            onActivate={handleActivate}
            tooltip={tooltip}
        />
    );
}
