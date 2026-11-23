import { useState } from 'react'
import type { MouseEvent } from 'react'
import { WorktreeSelectorController } from './worktree_selector_controller'
import { WorktreeSelectorStatusButton } from './worktree_selector_status_button'
import type { WorktreeSelectorProps } from './worktree_selector_types'

export type { WorktreeAssignment } from '../data/data_types'
export type { WorktreeAssignmentTarget } from './worktree_selector_types'

/** Keeps live status updates inside button and mounts action controller only while active. */
export function WorktreeSelector(props: WorktreeSelectorProps) {
    const { assignment, assignmentTarget, disabled = false, disabledReason, labelPrefix, primaryPath } = props
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const cardInternalId = assignmentTarget.kind === 'card' ? assignmentTarget.cardInternalId : null
    const handleOpen = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        setAnchorElement(event.currentTarget)
    }
    const handleClose = () => setAnchorElement(null)

    return (
        <>
            <WorktreeSelectorStatusButton
                assignment={assignment}
                cardInternalId={cardInternalId}
                disabled={disabled}
                disabledReason={disabledReason}
                labelPrefix={labelPrefix}
                onOpen={handleOpen}
                primaryPath={primaryPath}
            />
            {anchorElement ? (
                <WorktreeSelectorController
                    anchorElement={anchorElement}
                    assignment={assignment}
                    assignmentTarget={assignmentTarget}
                    onClose={handleClose}
                    primaryPath={primaryPath}
                />
            ) : null}
        </>
    )
}
