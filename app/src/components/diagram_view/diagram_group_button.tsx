import { useCallback } from 'react'
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import {
    diagramGroupDrawingService,
    type DiagramGroupDrawingService,
} from '../../services/diagrams/diagram_group_drawing_service'
import { DiagramToolboxButton } from './diagram_toolbox_button'
import { useActiveDiagramTool } from './use_diagram_tool'

interface DiagramGroupButtonProps {
    drawing?: Pick<DiagramGroupDrawingService, 'activate'>
    session?: Pick<DiagramEditSessionService, 'getActiveToolSnapshot' | 'subscribeActiveTool'>
}

/** Activates rectangular group drawing. */
export function DiagramGroupButton({
    drawing = diagramGroupDrawingService,
    session = diagramEditSessionService,
}: DiagramGroupButtonProps) {
    const activeTool = useActiveDiagramTool(session, 'group')
    const handleActivate = useCallback(() => drawing.activate(), [drawing])

    return (
        <DiagramToolboxButton
            active={activeTool}
            label="Group"
            onActivate={handleActivate}
            tooltip="Draw group"
        />
    )
}
