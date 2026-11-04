import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PROJECT_CONFIG } from '../../../data/data_types'
import type { DiagramData } from '../../../services/diagrams/diagram_data'
import type { DiagramRecord } from '../../../services/diagrams/diagram_index'
import { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type { DiagramChange } from '../../../services/diagrams/diagram_edit_types'
import type { DiagramViewSourceSnapshot } from '../../../services/diagrams/diagram_view_service'
import {
    affectedDiagramObjects,
    DiagramChangeReviewService,
    groupDiagramChangeIds,
} from './diagram_change_review_service'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', legendEntryId: 'connection', to: 'store' }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: {
        description: 'Orders architecture',
        legend: [
            { id: 'focal', label: 'Focal', role: 'focal' },
            { id: 'store', label: 'Store', role: 'store' },
            { id: 'connection', kind: 'connection', label: 'Connection', useLabelAsDefault: false },
        ],
        title: 'Overview',
        type: 'architecture',
        version: 3,
    },
    nodes: [
        { id: 'orders', label: 'Orders', legendEntryId: 'focal', role: 'focal' },
        { id: 'store', label: 'Store', legendEntryId: 'store', role: 'store' },
    ],
}
const record: DiagramRecord = {actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json'}
const config = {
    ...DEFAULT_PROJECT_CONFIG,
    cardTypes: [
        { color: '#123456', idPrefix: 'J', label: 'Job', type: 'job' as const },
        { color: '#654321', idPrefix: 'F', label: 'Feature', type: 'feature' as const },
    ],
    states: [
        { alwaysVisible: true, color: '#123456', state: 'new' },
        { alwaysVisible: true, color: '#654321', state: 'ready' },
    ],
    workingFolder: 'design/feature_descriptions',
}

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot

    constructor(source: DiagramViewSourceSnapshot) {
        super()
        this.source = source
    }

    getSourceSnapshot = (): DiagramViewSourceSnapshot => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createSession(sourceRecord: DiagramRecord = record, savedRecord: DiagramRecord | null = null) {
    const session = new DiagramEditSessionService(new DiagramSourceStub({ diagram, record: sourceRecord }))
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    if (sourceRecord.pendingImplementation) session.restoreCreation(sourceRecord.id, savedRecord ? diagram : null, savedRecord)
    else session.start()

    return session
}

function createReview(
    session: DiagramEditSessionService,
    generate: () => string = () => '',
    validate: (content: string) => DiagramData = () => diagram,
) {
    return new DiagramChangeReviewService(
        session,
        { replace: vi.fn(() => true) },
        generate,
        validate,
        { getConfig: () => config },
    )
}

function change(overrides: Partial<DiagramChange>): DiagramChange {
    return {
        category: 'field',
        field: 'label',
        id: 'change',
        objectId: 'orders',
        objectKind: 'node',
        originalValue: 'Orders',
        ownerId: null,
        regionIndex: null,
        value: 'Purchases',
        ...overrides,
    }
}

describe('DiagramChangeReviewService', () => {
    it('initializes configured card draft once per open and retains edits while open', () => {
        const session = createSession()
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const review = createReview(session, () => '- Change orders.')

        expect(review.open()).toBe(true)
        expect(review.getCardTitleSnapshot()).toBe('implement Overview')
        expect(review.getCardTypeSnapshot()).toBe('job')
        expect(review.getTargetColumnSnapshot()).toBe('new')
        expect(review.markdownDraft.getSnapshot()).toBe('- Change orders.')

        review.setCardTitle('Custom title')
        review.setCardType('feature')
        review.setTargetColumn('ready')
        review.markdownDraft.edit('Custom Markdown')

        expect(review.open()).toBe(false)
        expect(review.getCardTitleSnapshot()).toBe('Custom title')
        expect(review.getCardTypeSnapshot()).toBe('feature')
        expect(review.getTargetColumnSnapshot()).toBe('ready')
        expect(review.markdownDraft.getSnapshot()).toBe('Custom Markdown')
    })

    it('links pending source diagram when no saved copy or semantic changes exist', () => {
        const pendingRecord = { ...record, pendingImplementation: true as const }
        const review = createReview(createSession(pendingRecord))

        review.open()

        expect(review.markdownDraft.getSnapshot()).toBe(
            'Implement diagram [Overview](<../diagrams/overview.json>).',
        )
        expect(review.getBlockingItemsSnapshot()).toEqual([])
    })

    it('links latest saved copy and appends semantic changes', () => {
        const pendingRecord = { ...record, pendingImplementation: true as const }
        const savedRecord = {
            ...record,
            id: 'copy',
            path: 'design/diagrams/overview-edited.json',
            sourceDiagramId: record.id,
        }
        const session = createSession(pendingRecord, savedRecord)
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const review = createReview(session, () => '- Change orders.')

        review.open()

        expect(review.markdownDraft.getSnapshot()).toBe(
            'Implement diagram [Overview](<../diagrams/overview-edited.json>).\n\n- Change orders.',
        )
    })

    it('shows exact parser failure and refuses save', () => {
        const session = createSession()
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const review = createReview(session, () => 'text', () => {
            throw new Error('Malformed diagram data: nodes.orders.label has empty string')
        })
        const saveListener = vi.fn()
        review.subscribeSaveRequested(saveListener)

        review.open()

        expect(review.getBlockingItemsSnapshot()).toEqual([
            'Malformed diagram data: nodes.orders.label has empty string',
        ])
        expect(review.requestSave()).toBe(false)
        expect(saveListener).not.toHaveBeenCalled()
    })

    it('closes without modifying edit-session changes', () => {
        const session = createSession()
        session.objects.setNodeField('orders', 'label', 'Purchases')
        const changeIds = session.read.getChangeIdsSnapshot()
        const review = createReview(session)

        review.open()
        review.close()

        expect(session.read.getChangeIdsSnapshot()).toBe(changeIds)
        expect(session.read.getNodeFieldSnapshot('orders', 'label')).toBe('Purchases')
    })

    it('groups changes by diagram semantics while preserving order', () => {
        const changes = new Map([
            ['metadata', change({ id: 'metadata', objectId: 'diagram', objectKind: 'meta' })],
            ['node', change({ id: 'node' })],
            ['edge', change({ id: 'edge', objectId: 'orders-store', objectKind: 'edge' })],
            ['member', change({ id: 'member', objectId: 'orders', objectKind: 'node', ownerId: 'backend' })],
            ['fragment', change({ id: 'fragment', objectId: 'transaction', objectKind: 'fragment' })],
        ])
        const session = { read: { getChange: (changeId: string) => changes.get(changeId) ?? null } }

        expect(groupDiagramChangeIds([...changes.keys()], session)).toEqual([
            { changeIds: ['metadata'], label: 'Diagram' },
            { changeIds: ['node'], label: 'Nodes' },
            { changeIds: ['edge'], label: 'Connections' },
            { changeIds: ['member'], label: 'Groups' },
            { changeIds: ['fragment'], label: 'Fragments' },
        ])
    })

    it('selects group membership objects and surviving endpoints of a removed edge', () => {
        const session = createSession()
        const membership = change({ category: 'membership', objectId: 'orders', ownerId: 'backend' })

        expect(affectedDiagramObjects(membership, session)).toEqual([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'backend', objectKind: 'group' },
        ])

        session.removeObjects([{ objectId: 'orders-store', objectKind: 'edge' }])
        const removedChangeId = session.read.getChangeIdsSnapshot().find((changeId) => (
            session.read.getChangeFieldSnapshot(changeId, 'objectKind') === 'edge'
        ))
        if (!removedChangeId) throw new Error('Missing removed edge change')
        const removedChange = session.read.getChange(removedChangeId)
        if (!removedChange) throw new Error('Missing removed edge')

        expect(affectedDiagramObjects(removedChange as DiagramChange, session)).toEqual([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'store', objectKind: 'node' },
        ])
    })
})
