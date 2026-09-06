import { parseDiagramData, type DiagramData } from '../../services/diagrams/diagram_data'
import { actionContextIdentity, diagramContext, type ActionContext } from '../../data/action_context'
import type { ActionRunEvent, ActionRunStatus } from '../../data/action_run_types'
import { generateUuid } from '../../data/uuid'
import { actionRunRegistry } from '../../services/actions/action_run_registry'
import {
    generateDiagramChangeDescriptions,
    type DiagramChangeDescriptionReader,
} from '../../services/diagrams/diagram_change_descriptions'
import {
    diagramEditSessionService,
    type DiagramChange,
    type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import {
    diagramSelectionService,
    type DiagramSelectionIdentity,
    type DiagramSelectionService,
} from '../../services/diagrams/diagram_selection_service'

const OPEN_CHANGED_EVENT = 'review:open'
const REPORT_CHANGED_EVENT = 'review:report'
const BLOCKING_ITEMS_CHANGED_EVENT = 'review:blockingItems'
const AGENT_HANDOFF_REQUESTED_EVENT = 'review:agentHandoffRequested'
const AGENT_HANDOFF_CHANGED_EVENT = 'review:agentHandoffChanged'
const SAVE_REQUESTED_EVENT = 'review:saveRequested'
const EMPTY_BLOCKING_ITEMS: readonly string[] = Object.freeze([])
const DELIVERED_RUN_STATUSES = new Set<ActionRunStatus>(['completed', 'okButNotAfter'])

export const DIAGRAM_CHANGE_GROUPS = ['Diagram', 'Nodes', 'Connections', 'Groups', 'Fragments'] as const

export type DiagramChangeGroup = typeof DIAGRAM_CHANGE_GROUPS[number]

export interface DiagramChangeGroupEntry {
    changeIds: readonly string[]
    label: DiagramChangeGroup
}

export interface DiagramReviewRequestDetail {
    changeIds: readonly string[]
    generatedText: string
}

export interface DiagramAgentHandoffRequestDetail extends DiagramReviewRequestDetail {
    reviewedChangeSetId: string
}

export type DiagramChangeReviewSession = DiagramChangeDescriptionReader & Pick<
    DiagramEditSessionService,
    'getEditableDiagram' | 'getFragmentSnapshot' | 'getSessionSnapshot'
>

type DiagramChangeReviewSelection = Pick<DiagramSelectionService, 'replace'>
type DiagramReviewGenerator = (reader: DiagramChangeDescriptionReader) => string
type DiagramReviewValidator = (content: string) => DiagramData
type DiagramRunSubscriber = (listener: (event: ActionRunEvent) => void) => () => void

interface ReviewedDiagramChanges {
    changeIds: readonly string[]
    contextIdentity: string
    diagramId: string
    generatedText: string
    id: string
}

interface DiagramImplementationRun {
    actionId: string
    contextIdentity: string
    reviewedChangeSetId: string
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}

function changeGroup(change: Readonly<DiagramChange>): DiagramChangeGroup {
    if (change.objectKind === 'meta' || change.objectKind === 'legendEntry') return 'Diagram'
    if (change.objectKind === 'entityField') return 'Nodes'
    if (change.objectKind === 'connectionPoint') return 'Connections'
    if (change.objectKind === 'group' || change.objectKind === 'node' && change.ownerId) return 'Groups'
    if (change.objectKind === 'fragment' || change.objectKind === 'edge' && change.ownerId) return 'Fragments'
    if (change.objectKind === 'edge') return 'Connections'

    return 'Nodes'
}

/** Groups stable change IDs without creating subscriptions to change fields. */
export function groupDiagramChangeIds(
    changeIds: readonly string[],
    session: Pick<DiagramChangeDescriptionReader, 'getChange'>,
) {
    const groupedIds = new Map<DiagramChangeGroup, string[]>(DIAGRAM_CHANGE_GROUPS.map((label) => [label, []]))
    for (const changeId of changeIds) {
        const change = session.getChange(changeId)
        if (!change) continue

        groupedIds.get(changeGroup(change as DiagramChange))?.push(changeId)
    }

    return DIAGRAM_CHANGE_GROUPS.flatMap((label): DiagramChangeGroupEntry[] => {
        const ids = groupedIds.get(label) ?? []

        return ids.length > 0 ? [{ changeIds: Object.freeze(ids), label }] : []
    })
}

function addIdentity(
    identities: DiagramSelectionIdentity[],
    identity: DiagramSelectionIdentity,
    session: DiagramChangeReviewSession,
) {
    const exists = identity.objectKind === 'node'
        ? !!session.getNodeSnapshot(identity.objectId)
        : identity.objectKind === 'edge'
            ? !!session.getEdgeSnapshot(identity.objectId)
            : !!session.getGroupSnapshot(identity.objectId)
    if (!exists || identities.some(({ objectId, objectKind }) => (
        objectId === identity.objectId && objectKind === identity.objectKind
    ))) return

    identities.push(identity)
}

function addNode(identities: DiagramSelectionIdentity[], nodeId: string, session: DiagramChangeReviewSession) {
    addIdentity(identities, { objectId: nodeId, objectKind: 'node' }, session)
}

function addEdge(identities: DiagramSelectionIdentity[], edgeId: string, session: DiagramChangeReviewSession) {
    addIdentity(identities, { objectId: edgeId, objectKind: 'edge' }, session)
}

function addGroup(identities: DiagramSelectionIdentity[], groupId: string, session: DiagramChangeReviewSession) {
    addIdentity(identities, { objectId: groupId, objectKind: 'group' }, session)
}

function collectionValue(change: Readonly<DiagramChange>) {
    const value = change.value ?? change.originalValue

    return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function addRemovedEdgeEndpoints(
    identities: DiagramSelectionIdentity[],
    change: Readonly<DiagramChange>,
    session: DiagramChangeReviewSession,
) {
    const edge = collectionValue(change)
    if (typeof edge?.from === 'string') addNode(identities, edge.from, session)
    if (typeof edge?.to === 'string') addNode(identities, edge.to, session)
}

function addRemovedGroupMembers(
    identities: DiagramSelectionIdentity[],
    change: Readonly<DiagramChange>,
    session: DiagramChangeReviewSession,
) {
    const group = collectionValue(change)
    if (!Array.isArray(group?.nodeIds)) return

    for (const nodeId of group.nodeIds) {
        if (typeof nodeId === 'string') addNode(identities, nodeId, session)
    }
}

function connectionPointEdgeId(objectId: string) {
    const suffixes = [':sourceAttachment', ':targetAttachment']
    const suffix = suffixes.find((candidate) => objectId.endsWith(candidate))

    return suffix ? objectId.slice(0, -suffix.length) : objectId
}

function entityFieldNodeId(objectId: string) {
    const bracketIndex = objectId.lastIndexOf('[')

    return bracketIndex < 0 ? objectId : objectId.slice(0, bracketIndex)
}

function addFragmentEdges(
    identities: DiagramSelectionIdentity[],
    change: Readonly<DiagramChange>,
    session: DiagramChangeReviewSession,
) {
    const fragment = session.getFragmentSnapshot(change.objectId) ?? collectionValue(change)
    if (!fragment || !('regions' in fragment) || !Array.isArray(fragment.regions)) return

    for (const region of fragment.regions) {
        if (!region || typeof region !== 'object' || !Array.isArray((region as { edgeIds?: unknown }).edgeIds)) continue
        for (const edgeId of (region as { edgeIds: unknown[] }).edgeIds) {
            if (typeof edgeId === 'string') addEdge(identities, edgeId, session)
        }
    }
}

/** Finds current selectable objects represented by one semantic change. */
export function affectedDiagramObjects(
    change: Readonly<DiagramChange>,
    session: DiagramChangeReviewSession,
) {
    const identities: DiagramSelectionIdentity[] = []
    if (change.objectKind === 'node') {
        addNode(identities, change.objectId, session)
        if (change.ownerId) addGroup(identities, change.ownerId, session)
    }
    if (change.objectKind === 'edge') {
        addEdge(identities, change.objectId, session)
        if (change.category === 'collection' && change.value === null) addRemovedEdgeEndpoints(identities, change, session)
    }
    if (change.objectKind === 'group') {
        addGroup(identities, change.objectId, session)
        if (change.category === 'collection' && change.value === null) addRemovedGroupMembers(identities, change, session)
    }
    if (change.objectKind === 'entityField') addNode(identities, entityFieldNodeId(change.objectId), session)
    if (change.objectKind === 'connectionPoint') addEdge(identities, connectionPointEdgeId(change.objectId), session)
    if (change.objectKind === 'fragment') addFragmentEdges(identities, change, session)

    return Object.freeze(identities)
}

/** Owns explicit review output and review-only selection state. */
export class DiagramChangeReviewService extends EventTarget {
    private agentHandoffContext: ActionContext | null = null
    private blockingItems: readonly string[] = EMPTY_BLOCKING_ITEMS
    private readonly createId: () => string
    private readonly deliveredChangeSetIds = new Set<string>()
    private generatedText = ''
    private readonly implementationRuns = new Map<string, DiagramImplementationRun>()
    private readonly implementationRunStatuses = new Map<string, ActionRunStatus>()
    private openState = false
    private readonly generate: DiagramReviewGenerator
    private readonly reviewedChangeSets = new Map<string, ReviewedDiagramChanges>()
    private readonly selection: DiagramChangeReviewSelection
    private readonly session: DiagramChangeReviewSession
    private readonly subscribeRunEvents: DiagramRunSubscriber
    private readonly validate: DiagramReviewValidator
    private reviewedChanges: ReviewedDiagramChanges | null = null
    private selectedChangeId: string | null = null
    private unsubscribeRunEvents: (() => void) | null = null

    constructor(
        session: DiagramChangeReviewSession = diagramEditSessionService,
        selection: DiagramChangeReviewSelection = diagramSelectionService,
        generate: DiagramReviewGenerator = generateDiagramChangeDescriptions,
        validate: DiagramReviewValidator = parseDiagramData,
        createId: () => string = generateUuid,
        subscribeRunEvents: DiagramRunSubscriber = (listener) => actionRunRegistry.subscribeActiveRunEvents(listener),
    ) {
        super()
        this.createId = createId
        this.generate = generate
        this.selection = selection
        this.session = session
        this.subscribeRunEvents = subscribeRunEvents
        this.validate = validate
    }

    getOpenSnapshot = () => this.openState

    getGeneratedTextSnapshot = () => this.generatedText

    getBlockingItemsSnapshot = () => this.blockingItems

    getAgentHandoffContextSnapshot = () => this.agentHandoffContext

    getImplementationRunStatusSnapshot = (runId: string) => this.implementationRunStatuses.get(runId) ?? null

    getReviewedChangeSetDeliveredSnapshot = (reviewedChangeSetId: string) => (
        this.deliveredChangeSetIds.has(reviewedChangeSetId)
    )

    getSelectedChangeSnapshot = (changeId: string) => this.selectedChangeId === changeId

    subscribeOpen = (listener: () => void) => this.subscribe(OPEN_CHANGED_EVENT, listener)

    subscribeGeneratedText = (listener: () => void) => this.subscribe(REPORT_CHANGED_EVENT, listener)

    subscribeBlockingItems = (listener: () => void) => this.subscribe(BLOCKING_ITEMS_CHANGED_EVENT, listener)

    subscribeSelectedChange = (changeId: string, listener: () => void) => (
        this.subscribe(`review:selected:${encodeURIComponent(changeId)}`, listener)
    )

    subscribeAgentHandoffRequested = (listener: EventListener) => this.subscribe(AGENT_HANDOFF_REQUESTED_EVENT, listener)

    subscribeAgentHandoffContext = (listener: () => void) => this.subscribe(AGENT_HANDOFF_CHANGED_EVENT, listener)

    subscribeImplementationRunStatus = (runId: string, listener: () => void) => (
        this.subscribe(`review:runStatus:${encodeURIComponent(runId)}`, listener)
    )

    subscribeReviewedChangeSetDelivered = (reviewedChangeSetId: string, listener: () => void) => (
        this.subscribe(`review:delivered:${encodeURIComponent(reviewedChangeSetId)}`, listener)
    )

    subscribeSaveRequested = (listener: EventListener) => this.subscribe(SAVE_REQUESTED_EVENT, listener)

    open() {
        this.refresh(true)
        this.reviewedChanges = this.captureReviewedChanges()
        if (this.openState) return false

        this.openState = true
        this.dispatchEvent(new Event(OPEN_CHANGED_EVENT))

        return true
    }

    close() {
        if (!this.openState) return false

        this.setSelectedChangeId(null)
        this.openState = false
        this.dispatchEvent(new Event(OPEN_CHANGED_EVENT))

        return true
    }

    selectChange(changeId: string) {
        const change = this.session.getChange(changeId)
        if (!change) return false

        this.selection.replace(affectedDiagramObjects(change as DiagramChange, this.session))
        this.setSelectedChangeId(changeId)

        return true
    }

    requestAgentHandoff() {
        this.refresh(false)
        const reviewedChanges = this.requireCurrentReviewedChanges()
        if (!reviewedChanges) return false
        this.ensureRunSubscription()
        this.agentHandoffContext = diagramContext(
            'root',
            reviewedChanges.diagramId,
            reviewedChanges.generatedText,
            reviewedChanges.id,
        )
        this.close()
        this.dispatchEvent(new Event(AGENT_HANDOFF_CHANGED_EVENT))
        const detail = {
            changeIds: reviewedChanges.changeIds,
            generatedText: reviewedChanges.generatedText,
            reviewedChangeSetId: reviewedChanges.id,
        }

        this.dispatchEvent(new CustomEvent<DiagramAgentHandoffRequestDetail>(AGENT_HANDOFF_REQUESTED_EVENT, { detail }))

        return true
    }

    closeAgentHandoff() {
        if (!this.agentHandoffContext) return false

        this.agentHandoffContext = null
        this.dispatchEvent(new Event(AGENT_HANDOFF_CHANGED_EVENT))

        return true
    }

    requestSave() {
        this.refresh(false)
        const detail = this.requestDetail()
        if (!detail) return false

        this.dispatchEvent(new CustomEvent<DiagramReviewRequestDetail>(SAVE_REQUESTED_EVENT, { detail }))

        return true
    }

    private requestDetail(): DiagramReviewRequestDetail | null {
        const changeIds = this.session.getChangeIdsSnapshot()
        if (changeIds.length === 0 || this.blockingItems.length > 0) return null

        return { changeIds: Object.freeze([...changeIds]), generatedText: this.generatedText }
    }

    private captureReviewedChanges(): ReviewedDiagramChanges | null {
        const session = this.session.getSessionSnapshot()
        const changeIds = this.session.getChangeIdsSnapshot()
        if (!session || changeIds.length === 0 || this.blockingItems.length > 0) return null
        if (!this.generatedText.trim()) {
            this.setBlockingItems(['Generated diagram change text is empty.'])

            return null
        }

        const current = this.reviewedChanges
        const sameReview = current
            && current.diagramId === session.sourceDiagramId
            && current.generatedText === this.generatedText
            && current.changeIds.length === changeIds.length
            && current.changeIds.every((changeId, index) => changeId === changeIds[index])
        if (sameReview) return current

        const id = this.createId()
        const context = diagramContext('root', session.sourceDiagramId, this.generatedText, id)
        const reviewedChanges: ReviewedDiagramChanges = {
            changeIds: Object.freeze([...changeIds]),
            contextIdentity: actionContextIdentity(context),
            diagramId: session.sourceDiagramId,
            generatedText: this.generatedText,
            id,
        }
        this.reviewedChangeSets.set(id, reviewedChanges)

        return reviewedChanges
    }

    private ensureRunSubscription() {
        this.unsubscribeRunEvents ??= this.subscribeRunEvents(this.handleRunEvent)
    }

    private readonly handleRunEvent = (event: ActionRunEvent) => {
        if (event.type !== 'run' || event.context.kind !== 'diagram' || event.context.type !== 'root') return

        const reviewedChangeSetId = event.context.diagramChangeSetId
        if (!reviewedChangeSetId) return

        const reviewedChanges = this.reviewedChangeSets.get(reviewedChangeSetId)
        const contextIdentity = actionContextIdentity(event.context)
        if (!reviewedChanges || reviewedChanges.contextIdentity !== contextIdentity) return

        const currentRun = this.implementationRuns.get(event.runId)
        if (currentRun && (
            currentRun.actionId !== event.rootActionId
            || currentRun.contextIdentity !== contextIdentity
            || currentRun.reviewedChangeSetId !== reviewedChangeSetId
        )) return
        const currentStatus = this.implementationRunStatuses.get(event.runId)
        if (!currentRun) {
            this.implementationRuns.set(event.runId, {
                actionId: event.rootActionId,
                contextIdentity,
                reviewedChangeSetId,
            })
        }
        if (currentStatus !== event.status) {
            this.implementationRunStatuses.set(event.runId, event.status)
            this.dispatchEvent(new Event(`review:runStatus:${encodeURIComponent(event.runId)}`))
        }
        if (!DELIVERED_RUN_STATUSES.has(event.status) || this.deliveredChangeSetIds.has(reviewedChangeSetId)) return

        this.deliveredChangeSetIds.add(reviewedChangeSetId)
        this.dispatchEvent(new Event(`review:delivered:${encodeURIComponent(reviewedChangeSetId)}`))
    }

    private requireCurrentReviewedChanges(): ReviewedDiagramChanges | null {
        const reviewedChanges = this.reviewedChanges
        const session = this.session.getSessionSnapshot()
        if (!reviewedChanges || !session) {
            this.setBlockingItems(['No reviewed diagram changes are active.'])

            return null
        }
        const changeIds = this.session.getChangeIdsSnapshot()
        const sameIds = changeIds.length === reviewedChanges.changeIds.length
            && changeIds.every((changeId, index) => changeId === reviewedChanges.changeIds[index])
        let generatedText = ''
        try {
            generatedText = this.generate(this.session)
        } catch (error) {
            this.setBlockingItems([`Change description failed: ${errorMessage(error)}`])

            return null
        }
        if (
            session.sourceDiagramId !== reviewedChanges.diagramId
            || !sameIds
            || generatedText !== reviewedChanges.generatedText
        ) {
            this.setBlockingItems(['Diagram changes changed after review. Review them again before sending to an agent.'])

            return null
        }

        return reviewedChanges
    }

    private refresh(generateText: boolean) {
        const blockingItems: string[] = []
        const diagram = this.session.getEditableDiagram()
        if (!diagram) blockingItems.push('No editable diagram is active.')
        else {
            try {
                this.validate(JSON.stringify(diagram))
            } catch (error) {
                blockingItems.push(errorMessage(error))
            }
        }

        let generatedText = this.generatedText
        if (generateText) {
            try {
                generatedText = this.generate(this.session)
            } catch (error) {
                generatedText = ''
                blockingItems.push(`Change description failed: ${errorMessage(error)}`)
            }
        }
        this.setBlockingItems(blockingItems)
        if (generateText) this.setGeneratedText(generatedText)
    }

    private setBlockingItems(blockingItems: string[]) {
        const nextItems = blockingItems.length > 0 ? Object.freeze(blockingItems) : EMPTY_BLOCKING_ITEMS
        if (this.blockingItems.length === nextItems.length
            && this.blockingItems.every((item, index) => item === nextItems[index])) return

        this.blockingItems = nextItems
        this.dispatchEvent(new Event(BLOCKING_ITEMS_CHANGED_EVENT))
    }

    private setGeneratedText(generatedText: string) {
        if (generatedText === this.generatedText) return

        this.generatedText = generatedText
        this.dispatchEvent(new Event(REPORT_CHANGED_EVENT))
    }

    private setSelectedChangeId(changeId: string | null) {
        if (changeId === this.selectedChangeId) return

        const previousChangeId = this.selectedChangeId
        this.selectedChangeId = changeId
        if (previousChangeId) this.dispatchEvent(new Event(`review:selected:${encodeURIComponent(previousChangeId)}`))
        if (changeId) this.dispatchEvent(new Event(`review:selected:${encodeURIComponent(changeId)}`))
    }

    private subscribe(eventType: string, listener: EventListener) {
        this.addEventListener(eventType, listener)

        return () => this.removeEventListener(eventType, listener)
    }
}

export const diagramChangeReviewService = new DiagramChangeReviewService()
