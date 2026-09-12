import { memo } from 'react'
import type { DiagramWaypoint } from '../../services/diagrams/diagram_data'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { diagramGeometryService, type DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { PositionedDiagramEdge } from '../../services/diagrams/diagram_layout'
import {
    diagramSelectionService, type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'
import { DiagramEdge } from './diagram_edge'
import {
    diagramObjectDetailsService, type DiagramObjectDetailsService,
} from './diagram_object_details_service'
import { useDiagramEdgeLabelPlacement, useDiagramEdgeRoute } from './use_diagram_geometry'
import { useIsDiagramObjectSelected } from './use_diagram_selection'
import { useEditableDiagramEdgeField } from './use_editable_diagram'
import { diagramEmphasisService, type DiagramEmphasisService } from '../../services/diagrams/diagram_emphasis_service'
import { useDiagramObjectDimmed } from './use_diagram_emphasis'

const EMPTY_NODE_LABELS: ReadonlyMap<string, string> = new Map()

interface EditableDiagramEdgeProps {
    details?: DiagramObjectDetailsService
    edgeId: string
    emphasis?: DiagramEmphasisService
    geometry?: DiagramGeometryService
    selection?: DiagramSelectionService
    session?: DiagramEditSessionService
}

/**
 * One connection of the New diagram. It observes its own model fields and its own derived route.
 */
function EditableDiagramEdgeLeaf({
    details = diagramObjectDetailsService,
    edgeId,
    emphasis = diagramEmphasisService,
    geometry = diagramGeometryService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: EditableDiagramEdgeProps) {
    const from = useEditableDiagramEdgeField(edgeId, 'from', session)
    const fromCardinality = useEditableDiagramEdgeField(edgeId, 'fromCardinality', session)
    const kind = useEditableDiagramEdgeField(edgeId, 'kind', session)
    const label = useEditableDiagramEdgeField(edgeId, 'label', session)
    const to = useEditableDiagramEdgeField(edgeId, 'to', session)
    const toCardinality = useEditableDiagramEdgeField(edgeId, 'toCardinality', session)
    const labelPlacement = useDiagramEdgeLabelPlacement(edgeId, geometry)
    const points = useDiagramEdgeRoute(edgeId, geometry)
    const selected = useIsDiagramObjectSelected(edgeId, 'edge', selection)
    const dimmed = useDiagramObjectDimmed('new', 'edge', edgeId, emphasis)
    if (from === null || to === null || kind === null || points.length === 0) return null

    const handleSelect = (_selection: unknown, ctrlKey: boolean) => {
        if (session.getActiveToolSnapshot() !== 'select') return

        const identity = { objectId: edgeId, objectKind: 'edge' } as const
        if (ctrlKey) {
            selection.toggle(identity)
        } else {
            selection.replace([identity])
        }
        const sessionSnapshot = session.getSessionSnapshot()
        if (sessionSnapshot) emphasis.moveTargetIfActive({diagramId: sessionSnapshot.sourceDiagramId, objectId: edgeId, objectKind: 'edge', surface: 'new'})
    }
    const handleOpenDetails = () => details.open({ objectId: edgeId, objectKind: 'edge' })

    const edge: PositionedDiagramEdge = {
        from,
        id: edgeId,
        kind,
        points: points as DiagramWaypoint[],
        to,
        ...(fromCardinality ? { fromCardinality } : {}),
        ...(label ? { label } : {}),
        ...(labelPlacement ? { labelPlacement } : {}),
        ...(toCardinality ? { toCardinality } : {}),
    }

    return (
        <DiagramEdge
            dimmed={dimmed}
            edge={edge}
            nodeLabels={EMPTY_NODE_LABELS}
            onOpenDetails={handleOpenDetails}
            onSelect={handleSelect}
            selected={selected}
        />
    )
}

/** Memoised so a collection host rerender caused by another member cannot rerender this leaf. */
export const EditableDiagramEdge = memo(EditableDiagramEdgeLeaf)
