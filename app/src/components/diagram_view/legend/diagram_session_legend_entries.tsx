import { useEffect, useState } from 'react'
import type { DiagramEdgeKind, DiagramLegendEntryData, DiagramNodeKind, DiagramRole } from '../../../services/diagrams/diagram_data'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service'
import { diagramLegendEntries, type DiagramLegendEntry } from './diagram_legend_entries'
import { DiagramLegendEntryList } from './diagram_legend_entry_list'

export type SessionLegendSource = DiagramEditSessionService

function sessionEntries(session: SessionLegendSource): DiagramLegendEntry[] {
    const type = session.read.getMetadataFieldSnapshot('type')
    if (!type) return []
    const legend = session.read.getHasExplicitLegendSnapshot()
        ? session.read.getLegendEntryKeysSnapshot().map((entryKey): DiagramLegendEntryData => {
            const label = session.read.getLegendEntryFieldSnapshot(entryKey, 'label')
            if (label === null) throw new Error(`Legend entry ${entryKey} has no label`)
            const role = session.read.getLegendEntryFieldSnapshot(entryKey, 'role')
            if (role !== null) return { label, role: role as DiagramRole }
            const nodeKind = session.read.getLegendEntryFieldSnapshot(entryKey, 'nodeKind')
            if (nodeKind !== null) return { label, nodeKind: nodeKind as DiagramNodeKind }
            const kind = session.read.getLegendEntryFieldSnapshot(entryKey, 'kind')
            if (kind !== null) return { kind: kind as DiagramEdgeKind, label }
            throw new Error(`Legend entry ${entryKey} has no semantic`)
        })
        : undefined
    const nodes = session.read.getNodeIdsSnapshot().map((nodeId) => ({
        kind: session.read.getNodeFieldSnapshot(nodeId, 'kind') ?? undefined,
        role: session.read.getNodeFieldSnapshot(nodeId, 'role') as DiagramRole,
    }))
    const edges = session.read.getEdgeIdsSnapshot().map((edgeId) => ({kind: session.read.getEdgeFieldSnapshot(edgeId, 'kind') as DiagramEdgeKind}))

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
            session.read.subscribeSession(onMembershipChange),
            session.read.subscribeLegendMembership(onMembershipChange),
            session.read.subscribeCollectionMembership('node', onMembershipChange),
            session.read.subscribeCollectionMembership('edge', onMembershipChange),
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
            ...displayedKeys.map((entryKey) => session.read.subscribeLegendEntryField(entryKey, 'label', refresh)),
            ...session.read.getNodeIdsSnapshot().map((nodeId) => session.read.subscribeNodeField(nodeId, 'role', refresh)),
            ...session.read.getNodeIdsSnapshot().map((nodeId) => session.read.subscribeNodeField(nodeId, 'kind', refresh)),
            ...session.read.getEdgeIdsSnapshot().map((edgeId) => session.read.subscribeEdgeField(edgeId, 'kind', refresh)),
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
    return <DiagramLegendEntryList
        entries={useSessionLegendEntries(session)}
        label={label}
        reader={session.read}
        session={session}
        store={session.formatting}
    />
}
