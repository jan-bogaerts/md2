import { parseDiagramData, type DiagramData } from '../../../services/diagrams/diagram_data'
import { dataService, type DataService } from '../../../services/data/data_service'
import {
    generateDiagramChangeDescriptions,
    type DiagramChangeDescriptionReader,
} from '../../../services/diagrams/diagram_change_descriptions'
import {
    diagramEditSessionService,
    type DiagramEditSessionAccess,
} from '../../../services/diagrams/diagram_edit_session_service'
import type {
    DiagramChange,
} from '../../../services/diagrams/diagram_edit_types'
import {
    diagramSelectionService,
    type DiagramSelectionIdentity,
    type DiagramSelectionService,
} from '../../../services/diagrams/diagram_selection_service'
import { MarkdownDraft } from '../../../services/markdown/markdown_draft'
import { diagramImplementationInstructions } from './diagram_implementation_instructions'

const OPEN_CHANGED_EVENT = 'review:open'
const REPORT_CHANGED_EVENT = 'review:report'
const BLOCKING_ITEMS_CHANGED_EVENT = 'review:blockingItems'
const TITLE_CHANGED_EVENT = 'review:title'
const CARD_TYPE_CHANGED_EVENT = 'review:cardType'
const TARGET_COLUMN_CHANGED_EVENT = 'review:targetColumn'
const SAVE_REQUESTED_EVENT = 'review:saveRequested'
const EMPTY_BLOCKING_ITEMS: readonly string[] = Object.freeze([])

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

export type DiagramChangeReviewSession = DiagramChangeDescriptionReader & DiagramEditSessionAccess<'getEditableDiagram' | 'getFragmentSnapshot' | 'getOriginalDiagramSnapshot' | 'getSavedRecordSnapshot' | 'getSessionSnapshot', never>

type DiagramChangeReviewSelection = Pick<DiagramSelectionService, 'replace'>
type DiagramReviewGenerator = (reader: DiagramChangeDescriptionReader) => string
type DiagramReviewValidator = (content: string) => DiagramData
type DiagramReviewConfig = Pick<DataService, 'getConfig'>

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
    session: { read: Pick<DiagramChangeDescriptionReader['read'], 'getChange'> },
) {
    const groupedIds = new Map<DiagramChangeGroup, string[]>(DIAGRAM_CHANGE_GROUPS.map((label) => [label, []]))
    for (const changeId of changeIds) {
        const change = session.read.getChange(changeId)
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
        ? !!session.read.getNodeSnapshot(identity.objectId)
        : identity.objectKind === 'edge'
            ? !!session.read.getEdgeSnapshot(identity.objectId)
            : !!session.read.getGroupSnapshot(identity.objectId)
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
    const fragment = session.read.getFragmentSnapshot(change.objectId) ?? collectionValue(change)
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
    private blockingItems: readonly string[] = EMPTY_BLOCKING_ITEMS
    private cardTitle = ''
    private cardType = ''
    private readonly config: DiagramReviewConfig
    private generatedText = ''
    readonly markdownDraft = new MarkdownDraft('')
    private openState = false
    private readonly generate: DiagramReviewGenerator
    private readonly selection: DiagramChangeReviewSelection
    private readonly session: DiagramChangeReviewSession
    private targetColumn = ''
    private readonly validate: DiagramReviewValidator
    private selectedChangeId: string | null = null

    constructor(
        session: DiagramChangeReviewSession = diagramEditSessionService,
        selection: DiagramChangeReviewSelection = diagramSelectionService,
        generate: DiagramReviewGenerator = generateDiagramChangeDescriptions,
        validate: DiagramReviewValidator = parseDiagramData,
        config: DiagramReviewConfig = dataService,
    ) {
        super()
        this.config = config
        this.generate = generate
        this.selection = selection
        this.session = session
        this.validate = validate
    }

    getOpenSnapshot = () => this.openState

    getGeneratedTextSnapshot = () => this.generatedText

    getBlockingItemsSnapshot = () => this.blockingItems

    getCardTitleSnapshot = () => this.cardTitle

    getCardTypeSnapshot = () => this.cardType

    getTargetColumnSnapshot = () => this.targetColumn

    getSelectedChangeSnapshot = (changeId: string) => this.selectedChangeId === changeId

    subscribeOpen = (listener: () => void) => this.subscribe(OPEN_CHANGED_EVENT, listener)

    subscribeGeneratedText = (listener: () => void) => this.subscribe(REPORT_CHANGED_EVENT, listener)

    subscribeBlockingItems = (listener: () => void) => this.subscribe(BLOCKING_ITEMS_CHANGED_EVENT, listener)

    subscribeCardTitle = (listener: () => void) => this.subscribe(TITLE_CHANGED_EVENT, listener)

    subscribeCardType = (listener: () => void) => this.subscribe(CARD_TYPE_CHANGED_EVENT, listener)

    subscribeTargetColumn = (listener: () => void) => this.subscribe(TARGET_COLUMN_CHANGED_EVENT, listener)

    subscribeSelectedChange = (changeId: string, listener: () => void) => (
        this.subscribe(`review:selected:${encodeURIComponent(changeId)}`, listener)
    )

    subscribeSaveRequested = (listener: EventListener) => this.subscribe(SAVE_REQUESTED_EVENT, listener)

    open() {
        if (this.openState) return false

        this.refresh(true)
        this.initializeCardDraft()

        this.openState = true
        this.dispatchEvent(new Event(OPEN_CHANGED_EVENT))

        return true
    }

    setCardTitle(title: string) {
        if (title === this.cardTitle) return

        this.cardTitle = title
        this.dispatchEvent(new Event(TITLE_CHANGED_EVENT))
    }

    setCardType(type: string) {
        if (type === this.cardType) return

        this.cardType = type
        this.dispatchEvent(new Event(CARD_TYPE_CHANGED_EVENT))
    }

    setTargetColumn(column: string) {
        if (column === this.targetColumn) return

        this.targetColumn = column
        this.dispatchEvent(new Event(TARGET_COLUMN_CHANGED_EVENT))
    }

    close() {
        if (!this.openState) return false

        this.setSelectedChangeId(null)
        this.openState = false
        this.dispatchEvent(new Event(OPEN_CHANGED_EVENT))

        return true
    }

    selectChange(changeId: string) {
        const change = this.session.read.getChange(changeId)
        if (!change) return false

        this.selection.replace(affectedDiagramObjects(change as DiagramChange, this.session))
        this.setSelectedChangeId(changeId)

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
        const changeIds = this.session.read.getChangeIdsSnapshot()
        if (changeIds.length === 0 || this.blockingItems.length > 0) return null

        return { changeIds: Object.freeze([...changeIds]), generatedText: this.generatedText }
    }

    private initializeCardDraft() {
        const diagram = this.session.read.getEditableDiagram()
        const config = this.config.getConfig()
        this.setCardTitle(diagram ? `implement ${diagram.meta.title}` : '')
        this.setCardType(config?.cardTypes[0]?.type ?? '')
        this.setTargetColumn(config?.states[0]?.state ?? '')

        const originalDiagram = this.session.read.getOriginalDiagramSnapshot()
        const markdown = originalDiagram && config
            ? diagramImplementationInstructions(
                diagram?.meta.title ?? originalDiagram.diagram.meta.title,
                this.generatedText,
                originalDiagram.record,
                this.session.read.getSavedRecordSnapshot(),
                config.workingFolder,
            )
            : this.generatedText
        this.markdownDraft.replace(markdown)
    }

    private refresh(generateText: boolean) {
        const blockingItems: string[] = []
        const diagram = this.session.read.getEditableDiagram()
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
