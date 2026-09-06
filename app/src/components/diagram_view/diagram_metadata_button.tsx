import { useCallback } from 'react'
import {
    diagramObjectDetailsService,
    type DiagramObjectDetailsService,
} from './diagram_object_details_service'
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button'

interface DiagramMetadataButtonProps {
    details?: Pick<DiagramObjectDetailsService, 'open'>
}

/** Opens metadata editing for the New diagram. */
export function DiagramMetadataButton({ details = diagramObjectDetailsService }: DiagramMetadataButtonProps) {
    const handleActivate = useCallback(() => details.open({ objectKind: 'meta' }), [details])

    return (
        <DiagramToolboxActionButton
            label="Metadata"
            onActivate={handleActivate}
            tooltip="Edit diagram metadata"
        />
    )
}
