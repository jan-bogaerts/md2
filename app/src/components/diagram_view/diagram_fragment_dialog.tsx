import { Dialog, DialogTitle } from '@mui/material'
import { useEffect, useSyncExternalStore } from 'react'
import { diagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramFragmentForm, type FragmentDialogSession } from './diagram_fragment_form'
import {
    diagramFragmentDialogService, type DiagramFragmentDialogService,
} from './diagram_fragment_dialog_service'

/** Creates, edits, and deletes complete sequence fragments through one service-owned dialog target. */
export function DiagramFragmentDialog({
    dialog = diagramFragmentDialogService,
    session = diagramEditSessionService,
}: {
    dialog?: DiagramFragmentDialogService
    session?: FragmentDialogSession
}) {
    const target = useSyncExternalStore(dialog.subscribeTarget, dialog.getTargetSnapshot, dialog.getTargetSnapshot)
    const fragmentExists = useSyncExternalStore(
        (listener) => session.subscribeCollectionMembership('fragment', listener),
        () => !target?.fragmentId || !!session.getFragmentSnapshot(target.fragmentId),
        () => !target?.fragmentId || !!session.getFragmentSnapshot(target.fragmentId),
    )
    const handleClose = () => dialog.close()

    useEffect(() => {
        if (target?.fragmentId && !fragmentExists) dialog.close()
    }, [dialog, fragmentExists, target])

    return (
        <Dialog fullWidth maxWidth="sm" onClose={handleClose} open={!!target && fragmentExists}>
            <DialogTitle>{target?.fragmentId ? 'Edit sequence fragment' : 'New sequence fragment'}</DialogTitle>
            {target && fragmentExists ? (
                <DiagramFragmentForm
                    fragmentId={target.fragmentId}
                    key={target.fragmentId ?? 'new'}
                    onClose={handleClose}
                    session={session}
                />
            ) : null}
        </Dialog>
    )
}
