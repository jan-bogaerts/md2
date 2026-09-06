import { useCallback } from 'react'
import {
    diagramObjectDetailsService,
    type DiagramObjectDetailsService,
} from './diagram_object_details_service'
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button'

interface DiagramLegendButtonProps {
    details?: Pick<DiagramObjectDetailsService, 'open'>
}

/** Opens legend editing for the New diagram. */
export function DiagramLegendButton({ details = diagramObjectDetailsService }: DiagramLegendButtonProps) {
    const handleActivate = useCallback(() => details.open({ objectKind: 'legend' }), [details])

    return (
        <DiagramToolboxActionButton
            label="Legend"
            onActivate={handleActivate}
            tooltip="Edit diagram legend"
        />
    )
}
