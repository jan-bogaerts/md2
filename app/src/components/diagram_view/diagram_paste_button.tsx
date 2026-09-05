import { useCallback } from 'react'
import { diagramPasteService, type DiagramPasteService } from '../../services/diagrams/diagram_paste'
import { DiagramToolboxActionButton } from './diagram_toolbox_action_button'

interface DiagramPasteButtonProps {
    pasteService?: Pick<DiagramPasteService, 'paste'>
}

/** Pastes one validated clipboard fragment into active editable diagram. */
export function DiagramPasteButton({ pasteService = diagramPasteService }: DiagramPasteButtonProps) {
    const handlePaste = useCallback(() => {
        void pasteService.paste()
    }, [pasteService])

    return (
        <DiagramToolboxActionButton
            label="Paste"
            onActivate={handlePaste}
            tooltip="Paste diagram objects"
        />
    )
}
