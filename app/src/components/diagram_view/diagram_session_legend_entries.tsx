import { useEffect, useState } from 'react'
import type { DiagramEdgeKind, DiagramRole } from '../../services/diagrams/diagram_data'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import { derivedDiagramLegendEntries, type DiagramLegendEntry } from './diagram_legend_entries'
import { DiagramLegendEntryList } from './diagram_legend_entry_list'

export type SessionLegendSource = Pick<
    DiagramEditSessionService,
    'getEdgeFieldSnapshot'
    | 'getEdgeIdsSnapshot'
    | 'getLegendEntryFieldSnapshot'
    | 'getLegendEntryKeysSnapshot'
    | 'getNodeFieldSnapshot'
    | 'getNodeIdsSnapshot'
    | 'subscribeCollectionMembership'
    | 'subscribeEdgeField'
    | 'subscribeLegendEntryField'
    | 'subscribeLegendMembership'
    | 'subscribeNodeField'
    | 'subscribeSession'
>

function explicitEntries(session: SessionLegendSource, entryKeys: readonly string[]): DiagramLegendEntry[] {
    return entryKeys.flatMap((entryKey): DiagramLegendEntry[] => {
        const label = session.getLegendEntryFieldSnapshot(entryKey, 'label')
        if (label === null) return []
        const role = session.getLegendEntryFieldSnapshot(entryKey, 'role')
        if (role !== null) return [{ entryType: 'node', label, role: role as DiagramRole }]
        const kind = session.getLegendEntryFieldSnapshot(entryKey, 'kind')

        return kind === null ? [] : [{ entryType: 'connection', kind: kind as DiagramEdgeKind, label }]
    })
}

function sessionEntries(session: SessionLegendSource): DiagramLegendEntry[] {
    const entryKeys = session.getLegendEntryKeysSnapshot()
    if (entryKeys.length > 0) return explicitEntries(session, entryKeys)

    const roles = session.getNodeIdsSnapshot()
        .map((nodeId) => session.getNodeFieldSnapshot(nodeId, 'role'))
        .filter((role): role is DiagramRole => role !== null)
    const kinds = session.getEdgeIdsSnapshot()
        .map((edgeId) => session.getEdgeFieldSnapshot(edgeId, 'kind'))
        .filter((kind): kind is DiagramEdgeKind => kind !== null)

    return derivedDiagramLegendEntries(roles, kinds)
}

/**
 * Subscribes to explicit legend membership and each entry's own label, falling back to the semantics
 * of the edited nodes and edges while the diagram carries no explicit entries. Never reads a complete
 * diagram or legend snapshot.
 */
function useSessionLegendEntries(session: SessionLegendSource) {
    const [entries, setEntries] = useState(() => sessionEntries(session))
    const [membershipVersion, setMembershipVersion] = useState(0)

    useEffect(() => {
        const onMembershipChange = () => {
            setEntries(sessionEntries(session))
            setMembershipVersion((version) => version + 1)
        }
        onMembershipChange()
        const unsubscribes = [
            session.subscribeSession(onMembershipChange),
            session.subscribeLegendMembership(onMembershipChange),
            session.subscribeCollectionMembership('node', onMembershipChange),
            session.subscribeCollectionMembership('edge', onMembershipChange),
        ]

        return () => {
            for (const unsubscribe of unsubscribes) unsubscribe()
        }
    }, [session])

    useEffect(() => {
        const refresh = () => setEntries(sessionEntries(session))
        const unsubscribes = [
            ...session.getLegendEntryKeysSnapshot().map((entryKey) => session.subscribeLegendEntryField(entryKey, 'label', refresh)),
            ...session.getNodeIdsSnapshot().map((nodeId) => session.subscribeNodeField(nodeId, 'role', refresh)),
            ...session.getEdgeIdsSnapshot().map((edgeId) => session.subscribeEdgeField(edgeId, 'kind', refresh)),
        ]

        return () => {
            for (const unsubscribe of unsubscribes) unsubscribe()
        }
    }, [membershipVersion, session])

    return entries
}

/** Legend body describing the New diagram of the active edit session. */
export function DiagramSessionLegendEntries({
    label = 'New diagram legend entries',
    session = diagramEditSessionService,
}: {
    label?: string
    session?: SessionLegendSource
}) {
    return <DiagramLegendEntryList entries={useSessionLegendEntries(session)} label={label} />
}
