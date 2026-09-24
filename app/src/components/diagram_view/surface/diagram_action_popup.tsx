import { useSyncExternalStore } from 'react'
import type { DiagramViewService } from '../../../services/diagrams/diagram_view_service'
import { ActionPopup } from '../../actions/run/popup/action_popup'

interface DiagramActionPopupProps {
    service: Pick<DiagramViewService, 'closePopup' | 'getPopupSnapshot' | 'subscribePopup'>
    visible: boolean
}

/** Active diagram action popup, subscribed independently from the diagram surface. */
export function DiagramActionPopup({ service, visible }: DiagramActionPopupProps) {
    const popup = useSyncExternalStore(service.subscribePopup, service.getPopupSnapshot, service.getPopupSnapshot)
    const handleClose = () => service.closePopup()
    if (!popup) return null

    return (
        <ActionPopup
            anchorElement={popup.anchorElement}
            context={popup.context}
            draggable
            initialActionId={popup.initialActionId}
            onClose={handleClose}
            open={visible}
            popupEntryId={popup.id}
            popupVisible={visible}
        />
    )
}
