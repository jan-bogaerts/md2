import { memo } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { PositionedDiagramNode } from '../../services/diagrams/diagram_layout'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import { DiagramNode } from './diagram_node'
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from './diagram_object_details_service'
import { useDiagramNodeGeometryField } from './use_diagram_geometry'
import { useIsDiagramObjectSelected } from './use_diagram_selection'
import { useEditableDiagramMetadataField, useEditableDiagramNodeField } from './use_editable_diagram'

interface EditableDiagramNodeProps {
    details?: DiagramObjectDetailsService
    geometry?: DiagramGeometryService
    nodeId: string
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
}

/**
 * One node of the New diagram. Every value it renders arrives through its own field subscription, so an edit to a
 * sibling node, an edge, a group, or the metadata cannot rerender this leaf.
 */
function EditableDiagramNodeLeaf({
    details = diagramObjectDetailsService,
    geometry = diagramGeometryService,
    nodeId,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: EditableDiagramNodeProps) {
    const diagramType = useEditableDiagramMetadataField('type', session)
    const preset = useEditableDiagramMetadataField('preset', session)
    const kind = useEditableDiagramNodeField(nodeId, 'kind', session)
    const label = useEditableDiagramNodeField(nodeId, 'label', session)
    const role = useEditableDiagramNodeField(nodeId, 'role', session)
    const sublabel = useEditableDiagramNodeField(nodeId, 'sublabel', session)
    const tag = useEditableDiagramNodeField(nodeId, 'tag', session)
    const fanIn = useDiagramNodeGeometryField(nodeId, 'fanIn', geometry)
    const height = useDiagramNodeGeometryField(nodeId, 'height', geometry)
    const width = useDiagramNodeGeometryField(nodeId, 'width', geometry)
    const x = useDiagramNodeGeometryField(nodeId, 'x', geometry)
    const y = useDiagramNodeGeometryField(nodeId, 'y', geometry)
    const selected = useIsDiagramObjectSelected(nodeId, 'node', selection)
    if (!diagramType || label === null || role === null || width === null || height === null) return null

    const handleSelect = (_selection: unknown, ctrlKey: boolean) => {
        if (session.getActiveToolSnapshot() !== 'select') return

        const identity = { objectId: nodeId, objectKind: 'node' } as const
        if (ctrlKey) {
            selection.toggle(identity)
            return
        }
        selection.replace([identity])
    }
    const handleOpenDetails = () => details.open({ objectId: nodeId, objectKind: 'node' })

    const node: PositionedDiagramNode = {
        fanIn: fanIn ?? 0,
        height,
        id: nodeId,
        label,
        role,
        width,
        x: x ?? 0,
        y: y ?? 0,
        ...(kind ? { kind } : {}),
        ...(sublabel ? { sublabel } : {}),
        ...(tag ? { tag } : {}),
    }

    return (
        <DiagramNode
            diagramType={diagramType}
            entityFieldSource={diagramType === 'entity' ? { nodeId, session } : undefined}
            flowPreset={preset ?? undefined}
            node={node}
            onOpenDetails={handleOpenDetails}
            onSelect={handleSelect}
            selected={selected}
        />
    )
}

/** Memoised so a collection host rerender caused by another member cannot rerender this leaf. */
export const EditableDiagramNode = memo(EditableDiagramNodeLeaf)
