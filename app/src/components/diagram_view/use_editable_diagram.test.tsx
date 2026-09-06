import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import {
    useEditableDiagramChangeField,
    useEditableDiagramChangeIds,
    useEditableDiagramEdgeField,
    useEditableDiagramGroupField,
    useEditableDiagramGroupNodeIds,
    useEditableDiagramNodeField,
    useEditableDiagramNodeIds,
} from './use_editable_diagram'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', to: 'store' }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
}

interface ChangeTreeProps {
    collectionCounter: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    leafCounter: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    service: DiagramEditSessionService
}

function ChangeLeaf({ changeId, leafCounter, service }: ChangeTreeProps & { changeId: string }) {
    leafCounter(useEditableDiagramChangeField(changeId, 'value', service))

    return null
}

function ChangeCollection({ collectionCounter, leafCounter, service }: ChangeTreeProps) {
    const changeIds = useEditableDiagramChangeIds(service)
    collectionCounter(changeIds)

    return changeIds.map((changeId) => (
        <ChangeLeaf
            changeId={changeId}
            collectionCounter={collectionCounter}
            key={changeId}
            leafCounter={leafCounter}
            service={service}
        />
    ))
}
const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot = { diagram, record }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

interface RenderCounters {
    collection: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    edge: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    group: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    label: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    parent: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    root: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    sibling: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
}

interface TestTreeProps {
    counters: RenderCounters
    service: DiagramEditSessionService
}

function NodeLabel({ counters, nodeId, service }: TestTreeProps & { nodeId: string }) {
    const label = useEditableDiagramNodeField(nodeId, 'label', service)
    const counter = nodeId === 'orders' ? counters.label : counters.sibling
    counter(label)

    return null
}

function NodeCollection({ counters, service }: TestTreeProps) {
    const nodeIds = useEditableDiagramNodeIds(service)
    counters.collection(nodeIds)

    return nodeIds.map((nodeId) => <NodeLabel counters={counters} key={nodeId} nodeId={nodeId} service={service} />)
}

function EdgeLeaf({ counters, service }: TestTreeProps) {
    counters.edge(useEditableDiagramEdgeField('orders-store', 'kind', service))

    return null
}

function GroupLeaf({ counters, service }: TestTreeProps) {
    counters.group(useEditableDiagramGroupField('backend', 'label', service))

    return null
}

function DiagramParent({ counters, service }: TestTreeProps) {
    counters.parent()

    return (
        <>
            <NodeCollection counters={counters} service={service} />
            <EdgeLeaf counters={counters} service={service} />
            <GroupLeaf counters={counters} service={service} />
        </>
    )
}

function DiagramRoot({ counters, service }: TestTreeProps) {
    counters.root()

    return <DiagramParent counters={counters} service={service} />
}

interface MembershipTreeProps {
    otherGroupId: string
    otherMembershipCounter: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    membershipCounter: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    geometryCounter: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    service: DiagramEditSessionService
}

function MembershipLeaf({ groupId, counter, service }: {
    counter: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    groupId: string
    service: DiagramEditSessionService
}) {
    counter(useEditableDiagramGroupNodeIds(groupId, service))

    return null
}

function MembershipTree({ geometryCounter, membershipCounter, otherGroupId, otherMembershipCounter, service }: MembershipTreeProps) {
    return (
        <>
            <MembershipLeaf counter={membershipCounter} groupId="backend" service={service} />
            <MembershipLeaf counter={otherMembershipCounter} groupId={otherGroupId} service={service} />
            <GroupGeometryLeaf counter={geometryCounter} service={service} />
        </>
    )
}

function GroupGeometryLeaf({ counter, service }: {
    counter: ReturnType<typeof vi.fn<(...values: unknown[]) => void>>
    service: DiagramEditSessionService
}) {
    counter(useEditableDiagramGroupField('backend', 'x', service))

    return null
}

function createService() {
    const service = new DiagramEditSessionService(new DiagramSourceStub())
    service.bindProject(project)
    service.start()

    return service
}

afterEach(cleanup)

describe('editable diagram subscriptions', () => {
    it('rerenders only leaf subscribed to changed node field', () => {
        const service = createService()
        const counters: RenderCounters = {
            collection: vi.fn(),
            edge: vi.fn(),
            group: vi.fn(),
            label: vi.fn(),
            parent: vi.fn(),
            root: vi.fn(),
            sibling: vi.fn(),
        }
        render(<DiagramRoot counters={counters} service={service} />)
        const initialCounts = Object.fromEntries(
            Object.entries(counters).map(([name, counter]) => [name, counter.mock.calls.length]),
        )

        act(() => service.setNodeField('orders', 'label', 'Order API'))

        expect(counters.label).toHaveBeenCalledTimes(initialCounts.label + 1)
        expect(counters.label).toHaveBeenLastCalledWith('Order API')
        expect(counters.root).toHaveBeenCalledTimes(initialCounts.root)
        expect(counters.parent).toHaveBeenCalledTimes(initialCounts.parent)
        expect(counters.collection).toHaveBeenCalledTimes(initialCounts.collection)
        expect(counters.sibling).toHaveBeenCalledTimes(initialCounts.sibling)
        expect(counters.edge).toHaveBeenCalledTimes(initialCounts.edge)
        expect(counters.group).toHaveBeenCalledTimes(initialCounts.group)
    })

    it('rerenders one change leaf without rerendering the change collection', () => {
        const service = createService()
        service.setNodeField('orders', 'x', 4)
        const collectionCounter = vi.fn()
        const leafCounter = vi.fn()
        render(<ChangeCollection collectionCounter={collectionCounter} leafCounter={leafCounter} service={service} />)
        const changeIds = service.getChangeIdsSnapshot()

        act(() => service.setNodeField('orders', 'x', 8))

        expect(service.getChangeIdsSnapshot()).toBe(changeIds)
        expect(collectionCounter).toHaveBeenCalledOnce()
        expect(leafCounter).toHaveBeenCalledTimes(2)
        expect(leafCounter).toHaveBeenLastCalledWith(8)
    })

    it('rerenders only the membership leaf of the group whose members changed', () => {
        const service = createService()
        const otherGroupId = service.createGroup({ label: 'Frontend', nodeIds: [] })
        if (!otherGroupId) throw new Error('Frontend group was not created')
        const membershipCounter = vi.fn()
        const otherMembershipCounter = vi.fn()
        const geometryCounter = vi.fn()
        render(
            <MembershipTree
                geometryCounter={geometryCounter}
                membershipCounter={membershipCounter}
                otherGroupId={otherGroupId}
                otherMembershipCounter={otherMembershipCounter}
                service={service}
            />,
        )
        expect(membershipCounter).toHaveBeenLastCalledWith(['orders', 'store'])

        act(() => { service.removeGroupMember('backend', 'store') })

        expect(membershipCounter).toHaveBeenCalledTimes(2)
        expect(membershipCounter).toHaveBeenLastCalledWith(['orders'])
        expect(otherMembershipCounter).toHaveBeenCalledOnce()
        expect(geometryCounter).toHaveBeenCalledOnce()

        act(() => { service.addGroupMember(otherGroupId, 'store') })

        expect(otherMembershipCounter).toHaveBeenCalledTimes(2)
        expect(otherMembershipCounter).toHaveBeenLastCalledWith(['store'])
        expect(membershipCounter).toHaveBeenCalledTimes(2)
    })

    it('keeps the membership leaf mounted and stable when only group geometry changes', () => {
        const service = createService()
        const otherGroupId = service.createGroup({ label: 'Frontend', nodeIds: [] })
        if (!otherGroupId) throw new Error('Frontend group was not created')
        const membershipCounter = vi.fn()
        const geometryCounter = vi.fn()
        render(
            <MembershipTree
                geometryCounter={geometryCounter}
                membershipCounter={membershipCounter}
                otherGroupId={otherGroupId}
                otherMembershipCounter={vi.fn()}
                service={service}
            />,
        )
        const membership = service.getGroupNodeIdsSnapshot('backend')

        act(() => { service.setGroupField('backend', 'x', 8) })

        expect(geometryCounter).toHaveBeenCalledTimes(2)
        expect(membershipCounter).toHaveBeenCalledOnce()
        expect(service.getGroupNodeIdsSnapshot('backend')).toBe(membership)
    })
})
