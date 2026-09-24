import { Box } from '@mui/material'
import { useSyncExternalStore } from 'react'
import {
    diagramNodePlacementService,
    type DiagramNodePlacementService,
} from '../../../services/diagrams/diagram_node_placement_service'
import { DiagramNode } from '../rendering/diagram_node'

function ignorePreviewSelection() {}

/** Pointer-transparent node preview; only this leaf observes transient placement position. */
export function DiagramNodePlacementPreview({placement = diagramNodePlacementService}: {
    placement?: Pick<DiagramNodePlacementService, 'getPreviewSnapshot' | 'subscribePreview'>
}) {
    const preview = useSyncExternalStore(
        placement.subscribePreview,
        placement.getPreviewSnapshot,
        placement.getPreviewSnapshot,
    )
    if (!preview) return null

    return (
        <Box aria-hidden="true" sx={{ opacity: 0.6, pointerEvents: 'none' }}>
            <DiagramNode
                circular={preview.diagramType === 'mindmap'}
                diagramType={preview.diagramType}
                flowPreset={preview.flowPreset}
                node={{ ...preview.node, drilldown: false }}
                onSelect={ignorePreviewSelection}
                selected={false}
            />
        </Box>
    )
}
