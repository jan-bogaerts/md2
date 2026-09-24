import { memo, useCallback, useSyncExternalStore } from 'react'
import type { PositionedDiagramEdge } from '../../../services/diagrams/diagram_layout'
import { diagramViewService, type DiagramViewService } from '../../../services/diagrams/diagram_view_service'
import { DiagramEdge } from './diagram_edge'
import type { DiagramSelectHandler } from '../editing/diagram_selection'
import { diagramEmphasisService, type DiagramEmphasisService } from '../../../services/diagrams/diagram_emphasis_service'
import { useDiagramObjectDimmed } from '../surface/use_diagram_emphasis'

interface CurrentDiagramEdgeProps {
    curved?: boolean
    edge: PositionedDiagramEdge
    emphasis?: DiagramEmphasisService
    nodeLabels: ReadonlyMap<string, string>
    onSelect: DiagramSelectHandler
    service?: Pick<DiagramViewService, 'getCurrentSelectionSnapshot' | 'subscribeCurrentSelection'>
}

/** Current edge leaf with service-owned selection state. */
function CurrentDiagramEdgeLeaf(props: CurrentDiagramEdgeProps) {
    const {curved = false, edge, emphasis = diagramEmphasisService, nodeLabels} = props
    const {onSelect, service = diagramViewService} = props
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeCurrentSelection('edge', edge.id, listener),
        [edge.id, service],
    )
    const getSnapshot = useCallback(
        () => service.getCurrentSelectionSnapshot('edge', edge.id),
        [edge.id, service],
    )
    const selected = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const dimmed = useDiagramObjectDimmed('current', 'edge', edge.id, emphasis)

    return (
        <DiagramEdge
            curved={curved}
            dimmed={dimmed}
            edge={edge}
            formattingStore={service as DiagramViewService}
            nodeLabels={nodeLabels}
            onSelect={onSelect}
            selected={selected}
        />
    )
}

export const CurrentDiagramEdge = memo(CurrentDiagramEdgeLeaf)
