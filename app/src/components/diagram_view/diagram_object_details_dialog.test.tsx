import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData, DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data'
import { dialogService } from '../../services/dialog_service'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramSelectionService } from '../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { EditableDiagram } from './editable_diagram'
import { DiagramObjectDetailsService } from './diagram_object_details_service'

const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }

function diagram(type: DiagramType = 'architecture', flowPreset: DiagramFlowPreset = 'flowchart'): DiagramData {
    const nodeKind = type === 'flow' ? flowPreset === 'state' ? 'state' : 'step'
        : type === 'entity' ? 'entity' : type === 'sequence' ? 'participant' : undefined
    const edgeKind = type === 'flow' ? flowPreset === 'state' ? 'transition' : 'flow'
        : type === 'entity' ? 'relationship' : type === 'sequence' ? 'call' : 'connection'

    return {
        edges: [{
            from: 'orders',
            id: 'orders-store',
            kind: edgeKind,
            label: 'writes',
            ...(type === 'architecture' ? {
                sourceAttachment: { nodeId: 'orders', offset: 0.5, side: 'right' as const },
                targetAttachment: { nodeId: 'store', offset: 0.5, side: 'left' as const },
            } : {}),
            to: 'store',
        }, ...(type === 'sequence' ? [{from: 'store', id: 'store-orders', kind: 'return' as const, label: 'done', to: 'orders'}] : [])],
        groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
        meta: {
            description: 'Orders diagram',
            ...(type === 'flow' ? { preset: flowPreset } : {}),
            title: 'Overview',
            type,
            version: 1,
        },
        nodes: [
            {
                ...(type === 'entity' ? { fields: [{ key: 'primary' as const, name: 'id', type: 'uuid' }] } : {}),
                ...(nodeKind ? { kind: nodeKind } : {}),
                id: 'orders',
                label: 'Orders',
                role: 'focal',
            },
            { ...(nodeKind ? { kind: nodeKind } : {}), id: 'store', label: 'Store', role: 'store' },
        ],
    }
}

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot

    constructor(source: DiagramViewSourceSnapshot) {
        super()
        this.source = source
    }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function renderHarness(type: DiagramType = 'architecture', flowPreset: DiagramFlowPreset = 'flowchart') {
    const source = { diagram: diagram(type, flowPreset), record }
    const session = new DiagramEditSessionService(new DiagramSourceStub(source))
    session.bindProject(project)
    session.start()
    const geometry = new DiagramGeometryService(session)
    const selection = new DiagramSelectionService(session, geometry)
    const details = new DiagramObjectDetailsService()
    render(<EditableDiagram details={details} geometry={geometry} selection={selection} session={session} />)

    return { details, selection, session }
}

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('diagram object details dialog', () => {
    it('shows immutable diagram context and only shows a flow preset for flow diagrams', async () => {
        const architecture = renderHarness()
        const user = userEvent.setup()
        act(() => { architecture.details.open({ objectKind: 'meta' }) })

        expect(screen.getByRole('dialog', { name: 'Diagram metadata' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Type' })).toHaveValue('architecture')
        expect(screen.getByRole('textbox', { name: 'Type' })).toHaveAttribute('readonly')
        expect(screen.getByRole('textbox', { name: 'Schema version' })).toHaveValue('1')
        expect(screen.getByRole('textbox', { name: 'Schema version' })).toHaveAttribute('readonly')
        expect(screen.queryByRole('textbox', { name: 'Flow preset' })).toBeNull()
        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        cleanup()

        const flow = renderHarness('flow', 'state')
        act(() => { flow.details.open({ objectKind: 'meta' }) })

        expect(screen.getByRole('textbox', { name: 'Flow preset' })).toHaveValue('state')
        expect(screen.getByRole('textbox', { name: 'Flow preset' })).toHaveAttribute('readonly')
    })

    it('validates both required metadata drafts before applying either field', async () => {
        const { details, session } = renderHarness()
        const user = userEvent.setup()
        const setMetadataField = vi.spyOn(session, 'setMetadataField')
        act(() => { details.open({ objectKind: 'meta' }) })

        const title = screen.getByRole('textbox', { name: 'Title' })
        await user.clear(title)
        fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form') as HTMLFormElement)
        expect(screen.getByText('Title is required.')).toBeInTheDocument()
        expect(setMetadataField).not.toHaveBeenCalled()

        await user.type(title, 'Updated title')
        const description = screen.getByRole('textbox', { name: 'Description' })
        await user.clear(description)
        fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form') as HTMLFormElement)
        expect(screen.getByText('Description is required.')).toBeInTheDocument()
        expect(setMetadataField).not.toHaveBeenCalled()
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('trims and saves title and description through separate metadata operations', async () => {
        const { details, session } = renderHarness()
        const user = userEvent.setup()
        const setMetadataField = vi.spyOn(session, 'setMetadataField')
        act(() => { details.open({ objectKind: 'meta' }) })

        const title = screen.getByRole('textbox', { name: 'Title' })
        await user.clear(title)
        await user.type(title, '  Updated title  ')
        const description = screen.getByRole('textbox', { name: 'Description' })
        await user.clear(description)
        await user.type(description, '  Updated description  ')
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(setMetadataField).toHaveBeenNthCalledWith(1, 'title', 'Updated title')
        expect(setMetadataField).toHaveBeenNthCalledWith(2, 'description', 'Updated description')
        expect(session.getMetadataFieldSnapshot('title')).toBe('Updated title')
        expect(session.getMetadataFieldSnapshot('description')).toBe('Updated description')
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('keeps metadata drafts local when Cancel closes the dialog', async () => {
        const { details, session } = renderHarness()
        const user = userEvent.setup()
        act(() => { details.open({ objectKind: 'meta' }) })

        const title = screen.getByRole('textbox', { name: 'Title' })
        await user.clear(title)
        await user.type(title, 'Draft title')
        const description = screen.getByRole('textbox', { name: 'Description' })
        await user.clear(description)
        await user.type(description, 'Draft description')
        await user.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(session.getMetadataFieldSnapshot('title')).toBe('Overview')
        expect(session.getMetadataFieldSnapshot('description')).toBe('Orders diagram')
        expect(session.getDirtySnapshot()).toBe(false)
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it.each([
        ['Orders', 'Node details'],
        ['writes', 'Edge details'],
        ['Backend', 'Group details'],
    ])('opens focused details when %s is double-clicked', async (objectLabel, dialogTitle) => {
        renderHarness()
        const user = userEvent.setup()

        await user.dblClick(screen.getByRole('button', { name: objectLabel }))

        expect(screen.getByRole('dialog', { name: dialogTitle })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('saves changed node fields through their scoped operations only', async () => {
        const { session } = renderHarness()
        const user = userEvent.setup()
        const node = session.getNodeSnapshot('orders')
        const labelChanged = vi.fn()
        const roleChanged = vi.fn()
        const tagChanged = vi.fn()
        const sublabelChanged = vi.fn()
        const drilldownChanged = vi.fn()
        session.subscribeNodeField('orders', 'label', labelChanged)
        session.subscribeNodeField('orders', 'role', roleChanged)
        session.subscribeNodeField('orders', 'tag', tagChanged)
        session.subscribeNodeField('orders', 'sublabel', sublabelChanged)
        session.subscribeNodeField('orders', 'drilldown', drilldownChanged)

        await user.dblClick(screen.getByRole('button', { name: 'Orders' }))
        const label = screen.getByRole('textbox', { name: 'Label' })
        await user.clear(label)
        await user.type(label, 'Order intake')
        await user.click(screen.getByRole('combobox', { name: 'Role' }))
        await user.click(screen.getByRole('option', { name: 'backend' }))
        await user.type(screen.getByRole('textbox', { name: 'Tag' }), 'API')
        await user.type(screen.getByRole('textbox', { name: 'Sublabel' }), 'Receives orders')
        await user.click(screen.getByRole('combobox', { name: 'Drill-down' }))
        await user.click(screen.getByRole('option', { name: 'Enabled' }))
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(session.getNodeSnapshot('orders')).toBe(node)
        expect(session.getNodeFieldSnapshot('orders', 'label')).toBe('Order intake')
        expect(session.getNodeFieldSnapshot('orders', 'role')).toBe('backend')
        expect(session.getNodeFieldSnapshot('orders', 'tag')).toBe('API')
        expect(session.getNodeFieldSnapshot('orders', 'sublabel')).toBe('Receives orders')
        expect(session.getNodeFieldSnapshot('orders', 'drilldown')).toBe(true)
        expect(labelChanged).toHaveBeenCalledOnce()
        expect(roleChanged).toHaveBeenCalledOnce()
        expect(tagChanged).toHaveBeenCalledOnce()
        expect(sublabelChanged).toHaveBeenCalledOnce()
        expect(drilldownChanged).toHaveBeenCalledOnce()
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('keeps invalid node draft inside dialog and Cancel changes nothing', async () => {
        const { session } = renderHarness()
        const user = userEvent.setup()

        await user.dblClick(screen.getByRole('button', { name: 'Orders' }))
        const label = screen.getByRole('textbox', { name: 'Label' })
        await user.clear(label)
        await user.type(label, '   ')
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(screen.getByText('Label is required.')).toBeInTheDocument()
        expect(session.getNodeFieldSnapshot('orders', 'label')).toBe('Orders')
        await user.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('shows only fields supported by active diagram type', async () => {
        const { details, session } = renderHarness('entity')
        const user = userEvent.setup()

        await user.dblClick(screen.getByRole('button', { name: 'Orders' }))
        expect(screen.getByRole('textbox', { name: 'Field 1 name' })).toHaveValue('id')
        expect(screen.queryByRole('combobox', { name: 'Kind' })).toBeNull()
        await user.click(screen.getByRole('button', { name: 'Cancel' }))

        act(() => { details.open({ objectId: 'orders-store', objectKind: 'edge' }) })
        expect(screen.getByRole('combobox', { name: 'From cardinality' })).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'To cardinality' })).toBeInTheDocument()
        expect(screen.queryByRole('combobox', { name: 'Kind' })).toBeNull()
        expect(screen.queryByRole('combobox', { name: 'From' })).toBeNull()
        expect(screen.queryByRole('combobox', { name: 'To' })).toBeNull()
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('edits an entity relationship label and both optional cardinalities on the stable edge', async () => {
        const { details, session } = renderHarness('entity')
        const user = userEvent.setup()
        const edge = session.getEdgeSnapshot('orders-store')
        const labelChanged = vi.fn()
        const fromCardinalityChanged = vi.fn()
        const toCardinalityChanged = vi.fn()
        session.subscribeEdgeField('orders-store', 'label', labelChanged)
        session.subscribeEdgeField('orders-store', 'fromCardinality', fromCardinalityChanged)
        session.subscribeEdgeField('orders-store', 'toCardinality', toCardinalityChanged)

        act(() => { details.open({ objectId: 'orders-store', objectKind: 'edge' }) })
        const label = screen.getByRole('textbox', { name: 'Label' })
        await user.clear(label)
        await user.type(label, 'contains')
        await user.click(screen.getByRole('combobox', { name: 'From cardinality' }))
        await user.click(screen.getByRole('option', { name: '1' }))
        await user.click(screen.getByRole('combobox', { name: 'To cardinality' }))
        await user.click(screen.getByRole('option', { name: '0..1' }))
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(session.getEdgeSnapshot('orders-store')).toBe(edge)
        expect(session.getEdgeSnapshot('orders-store')).toMatchObject({fromCardinality: '1', label: 'contains', toCardinality: '0..1'})
        expect(labelChanged).toHaveBeenCalledOnce()
        expect(fromCardinalityChanged).toHaveBeenCalledOnce()
        expect(toCardinalityChanged).toHaveBeenCalledOnce()
    })

    it('adds, edits, orders, and removes entity fields before saving focused mutations', async () => {
        const { session } = renderHarness('entity')
        const user = userEvent.setup()
        const membershipChanged = vi.fn()
        session.subscribeEntityFieldMembership('orders', membershipChanged)

        await user.dblClick(screen.getByRole('button', { name: 'Orders' }))
        await user.click(screen.getByRole('button', { name: 'Add field' }))
        await user.type(screen.getByRole('textbox', { name: 'Field 2 name' }), 'customerId')
        await user.type(screen.getAllByRole('textbox', { name: 'Type' })[1], 'uuid')
        await user.click(screen.getAllByRole('combobox', { name: 'Key' })[1])
        await user.click(screen.getByRole('option', { name: 'Foreign' }))
        await user.click(screen.getByRole('button', { name: 'Move field 2 up' }))
        await user.click(screen.getByRole('button', { name: 'Remove field 2' }))
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(session.getNodeFieldSnapshot('orders', 'fields')).toEqual([
            { key: 'foreign', name: 'customerId', type: 'uuid' },
        ])
        expect(membershipChanged).toHaveBeenCalledTimes(2)
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('shows flow kind but hides entity-only fields', async () => {
        renderHarness('flow')
        const user = userEvent.setup()

        await user.dblClick(screen.getByRole('button', { name: 'Orders' }))
        expect(screen.getByRole('combobox', { name: 'Kind' })).toBeInTheDocument()
        expect(screen.queryByText('Entity fields')).toBeNull()
    })

    it('exposes state-node details with only state-preset kinds', async () => {
        renderHarness('flow', 'state')
        const user = userEvent.setup()

        await user.dblClick(screen.getByRole('button', { name: 'Orders' }))
        const kind = screen.getByRole('combobox', { name: 'Kind' })
        expect(kind).toHaveTextContent('state')

        await user.click(kind)
        expect(screen.getAllByRole('option').map(({ textContent }) => textContent)).toEqual(['start', 'end', 'state'])
    })

    it('saves edge and group labels through focused operations', async () => {
        const { details, session } = renderHarness()
        const user = userEvent.setup()
        const edgeChanged = vi.fn()
        const groupChanged = vi.fn()
        session.subscribeEdgeField('orders-store', 'label', edgeChanged)
        session.subscribeGroupField('backend', 'label', groupChanged)

        act(() => { details.open({ objectId: 'orders-store', objectKind: 'edge' }) })
        const edgeLabel = screen.getByRole('textbox', { name: 'Label' })
        await user.clear(edgeLabel)
        await user.type(edgeLabel, 'stores')
        await user.click(screen.getByRole('button', { name: 'Save' }))

        act(() => { details.open({ objectId: 'backend', objectKind: 'group' }) })
        const groupLabel = screen.getByRole('textbox', { name: 'Label' })
        await user.clear(groupLabel)
        await user.type(groupLabel, 'Services')
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(session.getEdgeFieldSnapshot('orders-store', 'label')).toBe('stores')
        expect(session.getGroupFieldSnapshot('backend', 'label')).toBe('Services')
        expect(edgeChanged).toHaveBeenCalledOnce()
        expect(groupChanged).toHaveBeenCalledOnce()
    })

    it('reconnects architecture edge endpoints without replacing edge or attachments', async () => {
        const { details, session } = renderHarness()
        const user = userEvent.setup()
        const edge = session.getEdgeSnapshot('orders-store')
        const sourceAttachment = session.getConnectionPointSnapshot('orders-store', 'sourceAttachment')
        const targetAttachment = session.getConnectionPointSnapshot('orders-store', 'targetAttachment')
        const fromChanged = vi.fn()
        const toChanged = vi.fn()
        session.subscribeEdgeField('orders-store', 'from', fromChanged)
        session.subscribeEdgeField('orders-store', 'to', toChanged)

        act(() => { details.open({ objectId: 'orders-store', objectKind: 'edge' }) })
        await user.click(screen.getByRole('combobox', { name: 'From' }))
        await user.click(screen.getByRole('option', { name: 'Store' }))
        await user.click(screen.getByRole('combobox', { name: 'To' }))
        await user.click(screen.getByRole('option', { name: 'Orders' }))
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(session.getEdgeSnapshot('orders-store')).toBe(edge)
        expect(session.getConnectionPointSnapshot('orders-store', 'sourceAttachment')).toBe(sourceAttachment)
        expect(session.getConnectionPointSnapshot('orders-store', 'targetAttachment')).toBe(targetAttachment)
        expect(session.getEdgeFieldSnapshot('orders-store', 'from')).toBe('store')
        expect(session.getEdgeFieldSnapshot('orders-store', 'to')).toBe('orders')
        expect(session.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'nodeId')).toBe('store')
        expect(session.getConnectionPointFieldSnapshot('orders-store', 'targetAttachment', 'nodeId')).toBe('orders')
        expect(fromChanged).toHaveBeenCalledOnce()
        expect(toChanged).toHaveBeenCalledOnce()
    })

    it('keeps architecture endpoint drafts unchanged when details are cancelled', async () => {
        const { details, session } = renderHarness()
        const user = userEvent.setup()

        act(() => { details.open({ objectId: 'orders-store', objectKind: 'edge' }) })
        await user.click(screen.getByRole('combobox', { name: 'From' }))
        await user.click(screen.getByRole('option', { name: 'Store' }))
        await user.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(session.getEdgeFieldSnapshot('orders-store', 'from')).toBe('orders')
        expect(session.getConnectionPointFieldSnapshot('orders-store', 'sourceAttachment', 'nodeId')).toBe('orders')
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('edits sequence label, endpoints, kind, and persisted message row', async () => {
        const { details, session } = renderHarness('sequence')
        const user = userEvent.setup()
        const edge = session.getEdgeSnapshot('orders-store')

        act(() => { details.open({ objectId: 'orders-store', objectKind: 'edge' }) })
        const label = screen.getByRole('textbox', { name: 'Label' })
        await user.clear(label)
        await user.type(label, 'completed')
        await user.click(screen.getByRole('combobox', { name: 'From' }))
        await user.click(screen.getByRole('option', { name: 'Store' }))
        await user.click(screen.getByRole('combobox', { name: 'To' }))
        await user.click(screen.getByRole('option', { name: 'Orders' }))
        await user.click(screen.getByRole('combobox', { name: 'Kind' }))
        await user.click(screen.getByRole('option', { name: 'success' }))
        await user.click(screen.getByRole('combobox', { name: 'Message row' }))
        await user.click(screen.getByRole('option', { name: '2' }))
        await user.click(screen.getByRole('button', { name: 'Save' }))

        expect(session.getEdgeSnapshot('orders-store')).toBe(edge)
        expect(session.getEdgeSnapshot('orders-store')).toMatchObject({from: 'store', kind: 'success', label: 'completed', to: 'orders'})
        expect(session.getEdgeIdsSnapshot()).toEqual(['store-orders', 'orders-store'])
    })

    it('closes and reports outside render when open object disappears', async () => {
        const { details, session } = renderHarness()
        const error = vi.spyOn(dialogService, 'error').mockImplementation(() => ({critical: false, id: 1, message: 'missing', severity: 'error', title: 'Error'}))
        act(() => { details.open({ objectId: 'backend', objectKind: 'group' }) })

        act(() => { session.removeGroup('backend') })

        await waitFor(() => expect(details.getTargetSnapshot()).toBeNull())
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(error).toHaveBeenCalledWith(
            expect.objectContaining({ message: 'Diagram group backend no longer exists' }),
            { fallbackMessage: 'Diagram object details are unavailable' },
        )
    })

    it('edits group membership through scoped member operations only', async () => {
        const { details, session } = renderHarness()
        const user = userEvent.setup()
        const group = session.getGroupSnapshot('backend')
        const node = session.getNodeSnapshot('store')
        const groupIds = session.getGroupIdsSnapshot()
        const labelChanged = vi.fn()
        const membershipChanged = vi.fn()
        session.subscribeGroupField('backend', 'label', labelChanged)
        session.subscribeGroupMembership('backend', membershipChanged)

        act(() => { details.open({ objectId: 'backend', objectKind: 'group' }) })
        await user.click(screen.getByRole('checkbox', { name: 'Store' }))

        expect(session.getGroupNodeIdsSnapshot('backend')).toEqual(['orders'])
        expect(membershipChanged).toHaveBeenCalledOnce()
        expect(labelChanged).not.toHaveBeenCalled()
        expect(session.getGroupSnapshot('backend')).toBe(group)
        expect(session.getNodeSnapshot('store')).toBe(node)
        expect(session.getGroupIdsSnapshot()).toBe(groupIds)

        await user.click(screen.getByRole('checkbox', { name: 'Store' }))

        expect(session.getGroupNodeIdsSnapshot('backend')).toEqual(['orders', 'store'])
        expect(membershipChanged).toHaveBeenCalledTimes(2)
    })

    it('records a group membership change distinct from the group move and resize changes', async () => {
        const { details, session } = renderHarness()
        const user = userEvent.setup()
        act(() => { session.setGroupField('backend', 'x', 12) })
        act(() => { session.setGroupField('backend', 'width', 20) })
        const geometryChangeIds = session.getChangeIdsSnapshot()

        act(() => { details.open({ objectId: 'backend', objectKind: 'group' }) })
        await user.click(screen.getByRole('checkbox', { name: 'Store' }))

        const membershipChangeIds = session.getChangeIdsSnapshot().filter((id) => !geometryChangeIds.includes(id))
        expect(membershipChangeIds).toHaveLength(1)
        expect(session.getChangeFieldSnapshot(membershipChangeIds[0], 'category')).toBe('membership')
        expect(session.getChangeFieldSnapshot(membershipChangeIds[0], 'field')).toBe('nodeIds')
        expect(session.getChangeFieldSnapshot(membershipChangeIds[0], 'ownerId')).toBe('backend')
        expect(session.getGroupFieldSnapshot('backend', 'x')).toBe(12)
        expect(session.getGroupFieldSnapshot('backend', 'width')).toBe(20)
    })

    it('drops the membership of a node removed while the group dialog is open', async () => {
        const { details, session } = renderHarness()

        act(() => { details.open({ objectId: 'backend', objectKind: 'group' }) })
        act(() => { session.removeNode('store') })

        await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Store' })).toBeNull())
        expect(session.getGroupNodeIdsSnapshot('backend')).toEqual(['orders'])
        expect(screen.getByRole('checkbox', { name: 'Orders' })).toBeChecked()
    })
})
