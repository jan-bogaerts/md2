import { useEffect, useState } from 'react'
import type { DiagramEdgeKind, DiagramLegendEntryData, DiagramNodeKind, DiagramRole } from '../../../services/diagrams/diagram_data'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service'
import { diagramLegendEntries, type DiagramLegendEntry } from './diagram_legend_entries'
import { DiagramLegendEntryList } from './diagram_legend_entry_list'

export type SessionLegendSource = DiagramEditSessionService

function sessionEntries(session: SessionLegendSource): DiagramLegendEntry[] {
    const type = session.getMetadataFieldSnapshot('type')
    if (!type) return []
    const legend = session.getHasExplicitLegendSnapshot()
        ? session.getLegendEntryKeysSnapshot().map((entryKey): DiagramLegendEntryData => {
            const label = session.getLegendEntryFieldSnapshot(entryKey, 'label')
            if (label === null) throw new Error(`Legend entry ${entryKey} has no label`)
            const role = session.getLegendEntryFieldSnapshot(entryKey, 'role')
            if (role !== null) return { label, role: role as DiagramRole }
            const nodeKind = session.getLegendEntryFieldSnapshot(entryKey, 'nodeKind')
            if (nodeKind !== null) return { label, nodeKind: nodeKind as DiagramNodeKind }
            const kind = session.getLegendEntryFieldSnapshot(entryKey, 'kind')
            if (kind !== null) return { kind: kind as DiagramEdgeKind, label }
            throw new Error(`Legend entry ${entryKey} has no semantic`)
        })
        : undefined
    const nodes = session.getNodeIdsSnapshot().map((nodeId) => ({
        kind: session.getNodeFieldSnapshot(nodeId, 'kind') ?? undefined,
        role: session.getNodeFieldSnapshot(nodeId, 'role') as DiagramRole,
    }))
    const edges = session.getEdgeIdsSnapshot().map((edgeId) => ({kind: session.getEdgeFieldSnapshot(edgeId, 'kind') as DiagramEdgeKind}))

    return diagramLegendEntries({ edges, meta: { legend, type }, nodes })
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
        const displayedKeys = sessionEntries(session).map((entry) => (
            entry.entryType === 'node' ? `node:${entry.role}`
                : entry.entryType === 'nodeKind' ? `nodeKind:${entry.nodeKind}` : `connection:${entry.kind}`
        ))
        const unsubscribes = [
            ...displayedKeys.map((entryKey) => session.subscribeLegendEntryField(entryKey, 'label', refresh)),
            ...session.getNodeIdsSnapshot().map((nodeId) => session.subscribeNodeField(nodeId, 'role', refresh)),
            ...session.getNodeIdsSnapshot().map((nodeId) => session.subscribeNodeField(nodeId, 'kind', refresh)),
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
    return <DiagramLegendEntryList entries={useSessionLegendEntries(session)} label={label} session={session} store={session} />
}
