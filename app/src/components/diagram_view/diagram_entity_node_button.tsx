import { useCallback, useSyncExternalStore } from 'react'
import type { DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data'
import {
    diagramEditSessionService,
    type DiagramPersistentTool,
} from '../../services/diagrams/diagram_edit_session_service'
import {
    diagramNodePlacementService,
    type DiagramNodePlacementDefinition,
    type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service'
import { DiagramToolboxButton } from './diagram_toolbox_button'
import { useActiveDiagramTool } from './use_diagram_tool'

const ENTITY_NODE_PREVIEW_SIZE = { height: 48, width: 160 }
const ENTITY_NODE_DEFINITION: DiagramNodePlacementDefinition = {
    defaults: { fields: [], label: 'New entity', role: 'focal', width: ENTITY_NODE_PREVIEW_SIZE.width },
    kind: 'entity',
    previewSize: ENTITY_NODE_PREVIEW_SIZE,
}

export interface DiagramEntityNodeSession {
    getActiveToolSnapshot: () => DiagramPersistentTool
    getMetadataFieldSnapshot: (field: 'preset' | 'type') => DiagramFlowPreset | DiagramType | null | undefined
    subscribeActiveTool: (listener: () => void) => () => void
    subscribeMetadataField: (field: 'preset' | 'type', listener: () => void) => () => void
    subscribeSession: (listener: () => void) => () => void
}

export type DiagramEntityNodePlacement = Pick<DiagramNodePlacementService, 'activate'>

interface DiagramEntityNodeButtonProps {
    placement?: DiagramEntityNodePlacement
    session?: DiagramEntityNodeSession
}

function useDiagramType(session: DiagramEntityNodeSession) {
    const subscribe = useCallback((listener: () => void) => {
        const unsubscribeType = session.subscribeMetadataField('type', listener)
        const unsubscribeSession = session.subscribeSession(listener)

        return () => {
            unsubscribeType()
            unsubscribeSession()
        }
    }, [session])
    const getSnapshot = useCallback(
        () => session.getMetadataFieldSnapshot('type'),
        [session],
    )

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Activates entity placement only for entity diagrams. */
export function DiagramEntityNodeButton({
    placement = diagramNodePlacementService,
    session = diagramEditSessionService,
}: DiagramEntityNodeButtonProps) {
    const diagramType = useDiagramType(session)
    const activeTool = useActiveDiagramTool(session, 'node:entity')
    const handleActivate = useCallback(() => {
        placement.activate(ENTITY_NODE_DEFINITION)
    }, [placement])

    if (diagramType !== 'entity') return null

    return (
        <DiagramToolboxButton
            active={activeTool}
            label="Entity"
            onActivate={handleActivate}
            tooltip="Place entity node"
        />
    )
}
