import { Box } from '@mui/material'
import { useSyncExternalStore } from 'react'
import {
    diagramNodePlacementService,
    type DiagramNodePlacementService,
} from '../../services/diagrams/diagram_node_placement_service'
import { DiagramNode } from './diagram_node'

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
                diagramType={preview.diagramType}
                flowPreset={preview.flowPreset}
                node={{ ...preview.node, drilldown: false }}
                onSelect={ignorePreviewSelection}
                selected={false}
            />
        </Box>
    )
}
