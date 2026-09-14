import type { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import type { DiagramViewService } from '../../services/diagrams/diagram_view_service'
import { DiagramFormattingScaleControl } from './diagram_formatting_scale_control'

/** Three diagram-wide percentage controls for one Current orNew surface. */
export function DiagramFormattingControls({
    store,
    surface,
}: {
    store: DiagramEditSessionService | DiagramViewService
    surface: 'Current' | 'New'
}) {
    return (
        <>
            <DiagramFormattingScaleControl field="fontScalePercent" label="font size" store={store} surface={surface} />
            <DiagramFormattingScaleControl field="boxScalePercent" label="box size" store={store} surface={surface} />
            <DiagramFormattingScaleControl field="spacingScalePercent" label="spacing" store={store} surface={surface} />
        </>
    )
}
