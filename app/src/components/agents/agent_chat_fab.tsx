import RobotOutline from 'mdi-material-ui/RobotOutline'
import { useState } from 'react'
import { projectContext } from '../../data/action_context'
import { ActionPopup } from '../actions/run/popup/action_popup'
import { MovableFab } from '../movable_fab'

const PROJECT_CONTEXT = projectContext()

/** Project-wide free-form agent launcher, movable anywhere in application viewport. */
export function AgentChatFab() {
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const handleActivate = (nextAnchorElement: HTMLElement) => setAnchorElement((current) => current ? null : nextAnchorElement)
    const handleDragStart = () => setAnchorElement(null)

    const handleClose = () => {
        setAnchorElement(null)
    }

    return (
        <>
            <MovableFab ariaLabel="Project agent" onActivate={handleActivate} onDragStart={handleDragStart} tooltip="Project agent">
                <RobotOutline />
            </MovableFab>
            {anchorElement ? (
                <ActionPopup
                    anchorElement={anchorElement}
                    context={PROJECT_CONTEXT}
                    draggable
                    onClose={handleClose}
                />
            ) : null}
        </>
    )
}
