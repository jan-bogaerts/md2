import AspectRatioOutlined from '@mui/icons-material/AspectRatioOutlined'
import FormatLineSpacingOutlined from '@mui/icons-material/FormatLineSpacingOutlined'
import FormatSizeOutlined from '@mui/icons-material/FormatSizeOutlined'
import { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type { DiagramViewService } from '../../../services/diagrams/diagram_view_service'
import { DiagramFormattingScaleControl } from './diagram_formatting_scale_control'

/** Three diagram-wide percentage controls for one Current or New surface. */
export function DiagramFormattingControls({
    store,
    surface,
}: {
    store: DiagramEditSessionService | DiagramViewService
    surface: 'Current' | 'New'
}) {
    const reader = store instanceof DiagramEditSessionService ? store.read : store

    return (
        <>
            <DiagramFormattingScaleControl
                field="fontScalePercent"
                icon={<FormatSizeOutlined fontSize="small" />}
                label="font size"
                reader={reader}
                store={store}
                surface={surface}
            />
            <DiagramFormattingScaleControl
                field="boxScalePercent"
                icon={<AspectRatioOutlined fontSize="small" />}
                label="box size"
                reader={reader}
                store={store}
                surface={surface}
            />
            <DiagramFormattingScaleControl
                field="spacingScalePercent"
                icon={<FormatLineSpacingOutlined fontSize="small" />}
                label="spacing"
                reader={reader}
                store={store}
                surface={surface}
            />
        </>
    )
}
