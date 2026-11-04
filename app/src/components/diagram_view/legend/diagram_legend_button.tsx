import { useCallback } from 'react'
import LegendToggleOutlined from '@mui/icons-material/LegendToggleOutlined'
import {
    diagramObjectDetailsService,
    type DiagramObjectDetailsService,
} from '../details/diagram_object_details_service'
import { DiagramToolboxActionButton } from '../creation_tools/diagram_toolbox_action_button'

interface DiagramLegendButtonProps {
    details?: Pick<DiagramObjectDetailsService, 'open'>
}

/** Opens the add-legend-entry dialog for the New diagram. */
export function DiagramLegendButton({ details = diagramObjectDetailsService }: DiagramLegendButtonProps) {
    const handleActivate = useCallback(() => details.open({ objectKind: 'legend' }), [details])

    return (
        <DiagramToolboxActionButton
            label="Legend"
            onActivate={handleActivate}
            tooltip="Add legend entry"
        ><LegendToggleOutlined fontSize="small" /></DiagramToolboxActionButton>
    )
}
