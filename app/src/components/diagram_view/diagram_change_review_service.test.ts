import { describe, expect, it, vi } from 'vitest'
import type { ActionContext } from '../../data/action_context'
import type { ActionRunEvent, ActionRunStatus } from '../../data/action_run_types'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramEditSessionService, type DiagramChange } from '../../services/diagrams/diagram_edit_session_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import {
    affectedDiagramObjects,
    type DiagramAgentHandoffRequestDetail,
    DiagramChangeReviewService,
    groupDiagramChangeIds,
} from './diagram_change_review_service'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', to: 'store' }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
}
const record: DiagramRecord = {actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json'}

class DiagramSourceStub extends EventTarget {
    private source: DiagramViewSourceSnapshot | null = { diagram, record }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createSession() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    session.start()

    return session
}

function createRunEvents() {
    let listener: ((event: ActionRunEvent) => void) | null = null
    const subscribe = vi.fn((nextListener: (event: ActionRunEvent) => void) => {
        listener = nextListener

        return () => {
            listener = null
        }
    })
    const emit = (event: ActionRunEvent) => {
        if (!listener) throw new Error('Run event listener is not active')

        listener(event)
    }

    return { emit, subscribe }
}

function implementationRunEvent(
    context: ActionContext,
    status: ActionRunStatus,
    overrides: Partial<Extract<ActionRunEvent, { type: 'run' }>> = {},
): ActionRunEvent {
    return {
        actionId: 'implement',
        context,
        phase: 'main',
        rootActionId: 'implement',
        runId: 'run-1',
        status,
        type: 'run',
        ...overrides,
    }
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
    it('generates and validates only at explicit review and handoff boundaries', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const selection = { replace: vi.fn(() => true) }
        const generate = vi.fn(() => 'generated report')
        const validate = vi.fn(() => diagram)
        const review = new DiagramChangeReviewService(session, selection, generate, validate)

        review.open()
        session.setNodeField('orders', 'label', 'Sales')

        expect(generate).toHaveBeenCalledTimes(1)
        expect(validate).toHaveBeenCalledTimes(1)
        expect(review.getGeneratedTextSnapshot()).toBe('generated report')
        expect(review.getBlockingItemsSnapshot()).toEqual([])

        review.requestAgentHandoff()

        expect(generate).toHaveBeenCalledTimes(2)
        expect(validate).toHaveBeenCalledTimes(2)
    })

    it('publishes exact reviewed text and IDs for valid handoff', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const review = new DiagramChangeReviewService(
            session,
            { replace: vi.fn(() => true) },
            () => 'agent text',
            undefined,
            () => 'review-1',
        )
        const listener = vi.fn()
        review.subscribeAgentHandoffRequested(listener)
        review.open()

        expect(review.requestAgentHandoff()).toBe(true)
        const detail = (listener.mock.calls[0][0] as CustomEvent<DiagramAgentHandoffRequestDetail>).detail
        expect(detail.generatedText).toBe('agent text')
        expect(detail.changeIds).toEqual(session.getChangeIdsSnapshot())
        expect(detail.reviewedChangeSetId).toBe('review-1')
        expect(review.getAgentHandoffContextSnapshot()).toEqual({
            diagramChanges: 'agent text', diagramChangeSetId: 'review-1', diagramId: 'diagram-1',
            kind: 'diagram', type: 'root',
        })
        expect(review.getOpenSnapshot()).toBe(false)

        session.setNodeField('orders', 'label', 'Sales')

        expect(review.getAgentHandoffContextSnapshot()?.diagramChanges).toBe('agent text')
    })

    it.each(['failed', 'cancelled'] as const)(
        'retains reviewed changes for retry after a %s run',
        (terminalStatus) => {
            const session = createSession()
            session.setNodeField('orders', 'label', 'Purchases')
            const runEvents = createRunEvents()
            const review = new DiagramChangeReviewService(
                session,
                { replace: vi.fn(() => true) },
                () => 'agent text',
                undefined,
                () => 'review-1',
                runEvents.subscribe,
            )
            review.open()
            review.requestAgentHandoff()
            const context = review.getAgentHandoffContextSnapshot()
            if (!context) throw new Error('Missing agent handoff context')
            const editableDiagram = session.getEditableDiagram()
            const changeIds = session.getChangeIdsSnapshot()

            runEvents.emit(implementationRunEvent(context, 'running'))
            runEvents.emit(implementationRunEvent(context, terminalStatus))

            expect(review.getImplementationRunStatusSnapshot('run-1')).toBe(terminalStatus)
            expect(review.getReviewedChangeSetDeliveredSnapshot('review-1')).toBe(false)
            expect(session.getEditableDiagram()).toBe(editableDiagram)
            expect(session.getChangeIdsSnapshot()).toBe(changeIds)

            review.closeAgentHandoff()
            review.open()
            review.requestAgentHandoff()
            expect(review.getAgentHandoffContextSnapshot()?.diagramChangeSetId).toBe('review-1')
        },
    )

    it('treats authoritative recovery failure as an interrupted retryable run', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const runEvents = createRunEvents()
        const review = new DiagramChangeReviewService(
            session,
            { replace: vi.fn(() => true) },
            () => 'agent text',
            undefined,
            () => 'review-1',
            runEvents.subscribe,
        )
        review.open()
        review.requestAgentHandoff()
        const context = review.getAgentHandoffContextSnapshot()
        if (!context) throw new Error('Missing agent handoff context')

        runEvents.emit(implementationRunEvent(context, 'running'))
        runEvents.emit(implementationRunEvent(context, 'failed'))

        expect(review.getImplementationRunStatusSnapshot('run-1')).toBe('failed')
        expect(review.getReviewedChangeSetDeliveredSnapshot('review-1')).toBe(false)
    })

    it.each(['completed', 'okButNotAfter'] as const)(
        'marks only the exact %s implementation run review as delivered',
        (terminalStatus) => {
            const session = createSession()
            session.setNodeField('orders', 'label', 'Purchases')
            const runEvents = createRunEvents()
            const review = new DiagramChangeReviewService(
                session,
                { replace: vi.fn(() => true) },
                () => 'agent text',
                undefined,
                () => 'review-1',
                runEvents.subscribe,
            )
            const runStatusListener = vi.fn()
            const deliveryListener = vi.fn()
            const reportListener = vi.fn()
            const changeIdsListener = vi.fn()
            review.open()
            review.requestAgentHandoff()
            const context = review.getAgentHandoffContextSnapshot()
            if (!context) throw new Error('Missing agent handoff context')
            const editableDiagram = session.getEditableDiagram()
            const changeIds = session.getChangeIdsSnapshot()
            review.subscribeImplementationRunStatus('run-1', runStatusListener)
            review.subscribeReviewedChangeSetDelivered('review-1', deliveryListener)
            review.subscribeGeneratedText(reportListener)
            session.subscribeChangeIds(changeIdsListener)

            runEvents.emit(implementationRunEvent(context, 'running'))
            runEvents.emit(implementationRunEvent(context, terminalStatus))

            expect(review.getImplementationRunStatusSnapshot('run-1')).toBe(terminalStatus)
            expect(review.getReviewedChangeSetDeliveredSnapshot('review-1')).toBe(true)
            expect(runStatusListener).toHaveBeenCalledTimes(2)
            expect(deliveryListener).toHaveBeenCalledOnce()
            expect(reportListener).not.toHaveBeenCalled()
            expect(changeIdsListener).not.toHaveBeenCalled()
            expect(session.getEditableDiagram()).toBe(editableDiagram)
            expect(session.getChangeIdsSnapshot()).toBe(changeIds)
        },
    )

    it('ignores results whose canonical action, run, diagram, or reviewed change-set identity changed', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const runEvents = createRunEvents()
        const review = new DiagramChangeReviewService(
            session,
            { replace: vi.fn(() => true) },
            () => 'agent text',
            undefined,
            () => 'review-1',
            runEvents.subscribe,
        )
        review.open()
        review.requestAgentHandoff()
        const context = review.getAgentHandoffContextSnapshot()
        if (!context) throw new Error('Missing agent handoff context')
        runEvents.emit(implementationRunEvent(context, 'running'))

        runEvents.emit(implementationRunEvent(context, 'completed', { actionId: 'other', rootActionId: 'other' }))
        runEvents.emit(implementationRunEvent({ ...context, diagramId: 'diagram-2' }, 'completed'))
        runEvents.emit(implementationRunEvent({ ...context, diagramChangeSetId: 'review-2' }, 'completed'))

        expect(review.getImplementationRunStatusSnapshot('run-1')).toBe('running')
        expect(review.getReviewedChangeSetDeliveredSnapshot('review-1')).toBe(false)
    })

    it('creates an undelivered review identity after later edits', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const runEvents = createRunEvents()
        const reviewIds = ['review-1', 'review-2']
        const review = new DiagramChangeReviewService(
            session,
            { replace: vi.fn(() => true) },
            () => `agent text ${session.getNodeFieldSnapshot('orders', 'label')}`,
            undefined,
            () => reviewIds.shift() ?? 'unexpected-review',
            runEvents.subscribe,
        )
        review.open()
        review.requestAgentHandoff()
        const firstContext = review.getAgentHandoffContextSnapshot()
        if (!firstContext) throw new Error('Missing first handoff context')
        runEvents.emit(implementationRunEvent(firstContext, 'completed'))

        session.setNodeField('orders', 'label', 'Sales')
        review.closeAgentHandoff()
        review.open()
        review.requestAgentHandoff()

        expect(review.getAgentHandoffContextSnapshot()?.diagramChangeSetId).toBe('review-2')
        expect(review.getReviewedChangeSetDeliveredSnapshot('review-1')).toBe(true)
        expect(review.getReviewedChangeSetDeliveredSnapshot('review-2')).toBe(false)
    })

    it('rejects a reviewed set changed before handoff', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) })
        review.open()

        session.setNodeField('orders', 'label', 'Sales')

        expect(review.requestAgentHandoff()).toBe(false)
        expect(review.getBlockingItemsSnapshot()).toEqual([
            'Diagram changes changed after review. Review them again before sending to an agent.',
        ])
        expect(review.getAgentHandoffContextSnapshot()).toBeNull()
        expect(review.getOpenSnapshot()).toBe(true)
    })

    it('rejects handoff without an active reviewed change set', () => {
        const review = new DiagramChangeReviewService(createSession(), { replace: vi.fn(() => true) })

        expect(review.requestAgentHandoff()).toBe(false)
        expect(review.getBlockingItemsSnapshot()).toEqual(['No reviewed diagram changes are active.'])
    })

    it('shows parser failure as blocker and refuses save and handoff', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const validate = vi.fn(() => {
            throw new Error('Malformed diagram data: nodes.orders.label has empty string')
        })
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) }, () => 'text', validate)
        const handoffListener = vi.fn()
        const saveListener = vi.fn()
        review.subscribeAgentHandoffRequested(handoffListener)
        review.subscribeSaveRequested(saveListener)

        review.open()

        expect(review.getBlockingItemsSnapshot()).toEqual([
            'Malformed diagram data: nodes.orders.label has empty string',
        ])
        expect(review.requestAgentHandoff()).toBe(false)
        expect(review.requestSave()).toBe(false)
        expect(handoffListener).not.toHaveBeenCalled()
        expect(saveListener).not.toHaveBeenCalled()
    })

    it('closes without modifying edit-session changes', () => {
        const session = createSession()
        session.setNodeField('orders', 'label', 'Purchases')
        const changeIds = session.getChangeIdsSnapshot()
        const review = new DiagramChangeReviewService(session, { replace: vi.fn(() => true) })

        review.open()
        review.close()

        expect(session.getChangeIdsSnapshot()).toBe(changeIds)
        expect(session.getNodeFieldSnapshot('orders', 'label')).toBe('Purchases')
    })

    it('groups changes by diagram semantics while preserving order', () => {
        const changes = new Map([
            ['metadata', change({ id: 'metadata', objectId: 'diagram', objectKind: 'meta' })],
            ['node', change({ id: 'node' })],
            ['edge', change({ id: 'edge', objectId: 'orders-store', objectKind: 'edge' })],
            ['member', change({ id: 'member', objectId: 'orders', objectKind: 'node', ownerId: 'backend' })],
            ['fragment', change({ id: 'fragment', objectId: 'transaction', objectKind: 'fragment' })],
        ])
        const session = { getChange: (changeId: string) => changes.get(changeId) ?? null }

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

        session.removeEdge('orders-store')
        const removedChangeId = session.getChangeIdsSnapshot().find((changeId) => (
            session.getChangeFieldSnapshot(changeId, 'objectKind') === 'edge'
        ))
        if (!removedChangeId) throw new Error('Missing removed edge change')
        const removedChange = session.getChange(removedChangeId)
        if (!removedChange) throw new Error('Missing removed edge')

        expect(affectedDiagramObjects(removedChange as DiagramChange, session)).toEqual([
            { objectId: 'orders', objectKind: 'node' },
            { objectId: 'store', objectKind: 'node' },
        ])
    })
})
