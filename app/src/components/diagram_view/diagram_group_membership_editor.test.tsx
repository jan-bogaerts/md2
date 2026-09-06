import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { DiagramGroupMembershipEditor } from './diagram_group_membership_editor'

const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const project = { branch: 'main', id: 'project', rootPath: 'C:/repo' }

function diagram(): DiagramData {
    return {
        edges: [],
        groups: [{ height: 8, id: 'backend', label: 'Backend', nodeIds: ['orders'], width: 12, x: 4, y: 2 }],
        meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
        nodes: [
            { id: 'orders', label: 'Orders', role: 'focal' },
            { id: 'store', label: 'Store', role: 'store' },
        ],
    }
}

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot = { diagram: diagram(), record }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

function createService() {
    const service = new DiagramEditSessionService(new DiagramSourceStub())
    service.bindProject(project)
    service.start()

    return service
}

function groupGeometry(session: DiagramEditSessionService) {
    return {
        height: session.getGroupFieldSnapshot('backend', 'height'),
        width: session.getGroupFieldSnapshot('backend', 'width'),
        x: session.getGroupFieldSnapshot('backend', 'x'),
        y: session.getGroupFieldSnapshot('backend', 'y'),
    }
}

afterEach(cleanup)

describe('diagram group membership editor', () => {
    it('lists every node of the active diagram with its current membership state', () => {
        const session = createService()

        render(<DiagramGroupMembershipEditor groupId="backend" session={session} />)

        expect(screen.getByRole('checkbox', { name: 'Orders' })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: 'Store' })).not.toBeChecked()
        expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    })

    it('adds one requested node ID without touching group geometry', async () => {
        const session = createService()
        const user = userEvent.setup()
        const addGroupMember = vi.spyOn(session, 'addGroupMember')
        const geometry = groupGeometry(session)
        const labelChanged = vi.fn()
        session.subscribeGroupField('backend', 'label', labelChanged)
        render(<DiagramGroupMembershipEditor groupId="backend" session={session} />)

        await user.click(screen.getByRole('checkbox', { name: 'Store' }))

        expect(addGroupMember).toHaveBeenCalledExactlyOnceWith('backend', 'store')
        expect(session.getGroupNodeIdsSnapshot('backend')).toEqual(['orders', 'store'])
        expect(screen.getByRole('checkbox', { name: 'Store' })).toBeChecked()
        expect(groupGeometry(session)).toEqual(geometry)
        expect(labelChanged).not.toHaveBeenCalled()
        expect(session.getNodeSnapshot('store')).toEqual(expect.objectContaining({ id: 'store', label: 'Store' }))
    })

    it('removes one requested node ID and leaves an empty group valid', async () => {
        const session = createService()
        const user = userEvent.setup()
        const removeGroupMember = vi.spyOn(session, 'removeGroupMember')
        render(<DiagramGroupMembershipEditor groupId="backend" session={session} />)

        await user.click(screen.getByRole('checkbox', { name: 'Orders' }))

        expect(removeGroupMember).toHaveBeenCalledExactlyOnceWith('backend', 'orders')
        expect(session.getGroupNodeIdsSnapshot('backend')).toEqual([])
        expect(session.getGroupSnapshot('backend')).not.toBeNull()
        expect(screen.getByRole('checkbox', { name: 'Orders' })).not.toBeChecked()
    })

    it('records a membership change that is distinct from the group move and resize changes', async () => {
        const session = createService()
        const user = userEvent.setup()
        act(() => { session.setGroupField('backend', 'x', 12) })
        act(() => { session.setGroupField('backend', 'width', 20) })
        const geometryChangeIds = session.getChangeIdsSnapshot()
        render(<DiagramGroupMembershipEditor groupId="backend" session={session} />)

        await user.click(screen.getByRole('checkbox', { name: 'Store' }))

        const membershipChangeIds = session.getChangeIdsSnapshot().filter((id) => !geometryChangeIds.includes(id))
        expect(membershipChangeIds).toHaveLength(1)
        expect(session.getChangeFieldSnapshot(membershipChangeIds[0], 'category')).toBe('membership')
        expect(session.getChangeFieldSnapshot(membershipChangeIds[0], 'field')).toBe('nodeIds')
        expect(session.getChangeFieldSnapshot(membershipChangeIds[0], 'ownerId')).toBe('backend')
        expect(session.getChangeFieldSnapshot(membershipChangeIds[0], 'objectId')).toBe('store')
        for (const changeId of geometryChangeIds) {
            expect(session.getChangeFieldSnapshot(changeId, 'category')).toBe('field')
        }
    })

    it('drops the row and the membership of a node removed from the diagram', () => {
        const session = createService()
        render(<DiagramGroupMembershipEditor groupId="backend" session={session} />)

        act(() => { session.removeNode('orders') })

        expect(session.getGroupNodeIdsSnapshot('backend')).toEqual([])
        expect(screen.queryByRole('checkbox', { name: 'Orders' })).toBeNull()
        expect(screen.getByRole('checkbox', { name: 'Store' })).not.toBeChecked()
    })

    it('rerenders only the row whose node label changed', () => {
        const session = createService()
        render(<DiagramGroupMembershipEditor groupId="backend" session={session} />)

        act(() => { session.setNodeField('store', 'label', 'Storage') })

        expect(screen.getByRole('checkbox', { name: 'Storage' })).toBeInTheDocument()
        expect(screen.getByRole('checkbox', { name: 'Orders' })).toBeChecked()
    })
})
