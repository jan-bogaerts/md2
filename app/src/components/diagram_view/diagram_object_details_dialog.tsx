import { Dialog, DialogTitle } from '@mui/material'
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useDialogError } from '../hooks/use_dialog_error'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { DiagramEdgeDetailsEditor } from './diagram_edge_details_editor'
import { DiagramGroupDetailsEditor } from './diagram_group_details_editor'
import { DiagramNodeDetailsEditor } from './diagram_node_details_editor'
import {
    diagramObjectDetailsService,
    type DiagramObjectDetailsService,
    type DiagramObjectDetailsTarget,
} from './diagram_object_details_service'

interface DiagramObjectDetailsDialogProps {
    details?: DiagramObjectDetailsService
    session?: DiagramEditSessionService
}

function targetExists(target: DiagramObjectDetailsTarget | null, session: DiagramEditSessionService) {
    if (!target) return true
    if (target.objectKind === 'node') return session.getNodeSnapshot(target.objectId) !== null
    if (target.objectKind === 'edge') return session.getEdgeSnapshot(target.objectId) !== null

    return session.getGroupSnapshot(target.objectId) !== null
}

export function DiagramObjectDetailsDialog({
    details = diagramObjectDetailsService,
    session = diagramEditSessionService,
}: DiagramObjectDetailsDialogProps) {
    const target = useSyncExternalStore(details.subscribeTarget, details.getTargetSnapshot, details.getTargetSnapshot)
    const subscribeExists = useCallback((listener: () => void) => {
        if (!target) return session.subscribeSession(listener)
        const unsubscribeMembership = session.subscribeCollectionMembership(target.objectKind, listener)
        const unsubscribeSession = session.subscribeSession(listener)

        return () => {
            unsubscribeMembership()
            unsubscribeSession()
        }
    }, [session, target])
    const getExistsSnapshot = useCallback(() => targetExists(target, session), [session, target])
    const exists = useSyncExternalStore(subscribeExists, getExistsSnapshot, getExistsSnapshot)
    const missingError = useMemo(() => (
        target && !exists ? new Error(`Diagram ${target.objectKind} ${target.objectId} no longer exists`) : null
    ), [exists, target])
    useDialogError(missingError, 'Diagram object details are unavailable')
    useEffect(() => {
        if (missingError) details.close()
    }, [details, missingError])
    const handleClose = () => details.close()
    const title = target ? `${target.objectKind[0].toUpperCase()}${target.objectKind.slice(1)} details` : 'Diagram object details'

    return (
        <Dialog fullWidth maxWidth="sm" onClose={handleClose} open={!!target && exists}>
            <DialogTitle>{title}</DialogTitle>
            {exists && target?.objectKind === 'node' ? (
                <DiagramNodeDetailsEditor key={`node:${target.objectId}`} nodeId={target.objectId} onClose={handleClose} session={session} />
            ) : null}
            {exists && target?.objectKind === 'edge' ? (
                <DiagramEdgeDetailsEditor edgeId={target.objectId} key={`edge:${target.objectId}`} onClose={handleClose} session={session} />
            ) : null}
            {exists && target?.objectKind === 'group' ? (
                <DiagramGroupDetailsEditor groupId={target.objectId} key={`group:${target.objectId}`} onClose={handleClose} session={session} />
            ) : null}
        </Dialog>
    )
}
