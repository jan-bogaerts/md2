import { useCallback } from 'react'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import {
    diagramObjectDetailsService,
    type DiagramObjectDetailsService,
} from '../details/diagram_object_details_service'
import { DiagramToolboxActionButton } from '../creation_tools/diagram_toolbox_action_button'

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
        ><DescriptionOutlined fontSize="small" /></DiagramToolboxActionButton>
    )
}
