import { memo, useCallback, useSyncExternalStore } from 'react'
import type { PositionedDiagramNode } from '../../services/diagrams/diagram_layout'
import { diagramViewService, type DiagramViewService } from '../../services/diagrams/diagram_view_service'
import { DiagramNode } from './diagram_node'
import type { DiagramSelectHandler } from './diagram_selection'
import { diagramEmphasisService, type DiagramEmphasisService } from '../../services/diagrams/diagram_emphasis_service'
import { useDiagramObjectDimmed } from './use_diagram_emphasis'

interface CurrentDiagramNodeProps {
    diagramType: Parameters<typeof DiagramNode>[0]['diagramType']
    emphasis?: DiagramEmphasisService
    flowPreset: Parameters<typeof DiagramNode>[0]['flowPreset']
    node: PositionedDiagramNode
    onSelect: DiagramSelectHandler
    service?: Pick<DiagramViewService, 'getCurrentSelectionSnapshot' | 'subscribeCurrentSelection'>
}

/** Current node leaf with service-owned selection state. */
function CurrentDiagramNodeLeaf(props: CurrentDiagramNodeProps) {
    const {diagramType, emphasis = diagramEmphasisService, flowPreset, node} = props
    const {onSelect, service = diagramViewService} = props
    const subscribe = useCallback(
        (listener: () => void) => service.subscribeCurrentSelection('node', node.id, listener),
        [node.id, service],
    )
    const getSnapshot = useCallback(
        () => service.getCurrentSelectionSnapshot('node', node.id),
        [node.id, service],
    )
    const selected = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const dimmed = useDiagramObjectDimmed('current', 'node', node.id, emphasis)

    return (
        <DiagramNode
            diagramType={diagramType}
            dimmed={dimmed}
            flowPreset={flowPreset}
            node={node}
            onSelect={onSelect}
            selected={selected}
        />
    )
}

export const CurrentDiagramNode = memo(CurrentDiagramNodeLeaf)
