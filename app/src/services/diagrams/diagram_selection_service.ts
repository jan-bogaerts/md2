import { register } from '../service_injector'
import {
    diagramEditSessionService,
    type DiagramCollectionKind,
    type DiagramEditSessionService,
    type DiagramMembershipChangeDetail,
} from './diagram_edit_session_service'

const SELECTION_MEMBERSHIP_CHANGED_EVENT = 'selection:membership'
const EMPTY_SELECTION: readonly DiagramSelectionIdentity[] = Object.freeze([])

export type DiagramSelectableObjectKind = Extract<DiagramCollectionKind, 'edge' | 'group' | 'node'>

export interface DiagramSelectionIdentity {
    objectId: string
    objectKind: DiagramSelectableObjectKind
}

type DiagramSelectionSession = Pick<
    DiagramEditSessionService,
    | 'getEdgeSnapshot'
    | 'getGroupSnapshot'
    | 'getNodeSnapshot'
    | 'getSessionSnapshot'
    | 'subscribeCollectionMembershipWillChange'
    | 'subscribeSession'
>

function selectionKey({ objectId, objectKind }: DiagramSelectionIdentity) {
    return `${objectKind}:${objectId}`
}

function selectedChangedEvent(identity: DiagramSelectionIdentity) {
    return `selection:${identity.objectKind}:${encodeURIComponent(identity.objectId)}`
}

function frozenIdentity(identity: DiagramSelectionIdentity): DiagramSelectionIdentity {
    return Object.freeze({ objectId: identity.objectId, objectKind: identity.objectKind })
}

/** Owns selected node, edge, and group identities for the active diagram edit session. */
export class DiagramSelectionService extends EventTarget {
    private selection: readonly DiagramSelectionIdentity[] = EMPTY_SELECTION
    private selectedKeys = new Set<string>()
    private readonly session: DiagramSelectionSession

    constructor(session: DiagramSelectionSession = diagramEditSessionService) {
        super()
        this.session = session
        this.session.subscribeSession(this.handleSessionChange)
        this.session.subscribeCollectionMembershipWillChange('edge', this.handleCollectionMembershipWillChange)
        this.session.subscribeCollectionMembershipWillChange('group', this.handleCollectionMembershipWillChange)
        this.session.subscribeCollectionMembershipWillChange('node', this.handleCollectionMembershipWillChange)
    }

    getSelectionSnapshot = () => this.selection

    getSelectedSnapshot = (identity: DiagramSelectionIdentity) => this.isSelected(identity)

    isSelected(identity: DiagramSelectionIdentity) {
        return this.selectedKeys.has(selectionKey(identity))
    }

    subscribeSelection = (listener: () => void) => this.subscribe(SELECTION_MEMBERSHIP_CHANGED_EVENT, listener)

    subscribeSelected = (identity: DiagramSelectionIdentity, listener: () => void) => (
        this.subscribe(selectedChangedEvent(identity), listener)
    )

    replace(identities: readonly DiagramSelectionIdentity[]) {
        const nextSelection: DiagramSelectionIdentity[] = []
        const nextKeys = new Set<string>()
        for (const identity of identities) {
            this.requireSelectableIdentity(identity)
            const key = selectionKey(identity)
            if (nextKeys.has(key)) continue

            nextKeys.add(key)
            nextSelection.push(frozenIdentity(identity))
        }
        if (this.hasSameMembership(nextKeys)) return false

        const changedIdentities = [
            ...this.selection.filter((identity) => !nextKeys.has(selectionKey(identity))),
            ...nextSelection.filter((identity) => !this.selectedKeys.has(selectionKey(identity))),
        ]
        this.selection = nextSelection.length > 0 ? Object.freeze(nextSelection) : EMPTY_SELECTION
        this.selectedKeys = nextKeys
        this.publish(changedIdentities)

        return true
    }

    add(identity: DiagramSelectionIdentity) {
        this.requireSelectableIdentity(identity)
        const key = selectionKey(identity)
        if (this.selectedKeys.has(key)) return false

        const storedIdentity = frozenIdentity(identity)
        this.selectedKeys.add(key)
        this.selection = Object.freeze([...this.selection, storedIdentity])
        this.publish([storedIdentity])

        return true
    }

    remove(identity: DiagramSelectionIdentity) {
        const key = selectionKey(identity)
        if (!this.selectedKeys.has(key)) return false

        this.selectedKeys.delete(key)
        this.selection = this.selection.length === 1
            ? EMPTY_SELECTION
            : Object.freeze(this.selection.filter((selected) => selectionKey(selected) !== key))
        this.publish([identity])

        return true
    }

    toggle(identity: DiagramSelectionIdentity) {
        return this.isSelected(identity) ? this.remove(identity) : this.add(identity)
    }

    clear() {
        if (this.selection.length === 0) return false

        const removed = this.selection
        this.selection = EMPTY_SELECTION
        this.selectedKeys = new Set<string>()
        this.publish(removed)

        return true
    }

    private handleSessionChange = () => {
        this.clear()
    }

    private handleCollectionMembershipWillChange = (event: Event) => {
        const { memberKind, removedIds } = (event as CustomEvent<DiagramMembershipChangeDetail>).detail
        const removedIdSet = new Set(removedIds)
        const removed = this.selection.filter(({ objectId, objectKind }) => (
            objectKind === memberKind && removedIdSet.has(objectId)
        ))
        if (removed.length === 0) return

        const removedKeys = new Set(removed.map(selectionKey))
        for (const key of removedKeys) this.selectedKeys.delete(key)
        this.selection = this.selection.length === removed.length
            ? EMPTY_SELECTION
            : Object.freeze(this.selection.filter((identity) => !removedKeys.has(selectionKey(identity))))
        this.publish(removed)
    }

    private hasSameMembership(nextKeys: Set<string>) {
        return nextKeys.size === this.selectedKeys.size && [...nextKeys].every((key) => this.selectedKeys.has(key))
    }

    private requireSelectableIdentity(identity: DiagramSelectionIdentity) {
        if (!this.session.getSessionSnapshot()) throw new Error('Cannot select a diagram object without an active edit session')
        if (identity.objectKind === 'edge' && this.session.getEdgeSnapshot(identity.objectId)) return
        if (identity.objectKind === 'group' && this.session.getGroupSnapshot(identity.objectId)) return
        if (identity.objectKind === 'node' && this.session.getNodeSnapshot(identity.objectId)) return

        throw new Error(`Diagram ${identity.objectKind} ${identity.objectId} does not exist`)
    }

    private publish(changedIdentities: readonly DiagramSelectionIdentity[]) {
        for (const identity of changedIdentities) this.dispatchEvent(new Event(selectedChangedEvent(identity)))
        this.dispatchEvent(new Event(SELECTION_MEMBERSHIP_CHANGED_EVENT))
    }

    private subscribe(eventType: string, listener: () => void) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}

export const diagramSelectionService = register('diagramSelectionService', new DiagramSelectionService())
