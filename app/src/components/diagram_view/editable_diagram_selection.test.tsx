import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramSelectionService } from '../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { EditableDiagram } from './editable_diagram'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', label: 'writes', to: 'store' }],
    groups: [{ id: 'backend', label: 'Backend', nodeIds: ['orders', 'store'] }],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { drilldown: false, id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
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

function renderHarness() {
    const session = new DiagramEditSessionService(new DiagramSourceStub())
    session.bindProject(project)
    session.start()
    const geometry = new DiagramGeometryService(session)
    const selection = new DiagramSelectionService(session)
    render(<EditableDiagram geometry={geometry} selection={selection} session={session} />)

    return { selection, session }
}

afterEach(cleanup)

describe('EditableDiagram direct selection', () => {
    it('replaces selection when a New node, edge, or group is clicked', async () => {
        const { selection } = renderHarness()
        const user = userEvent.setup()

        await user.click(screen.getByRole('button', { name: 'Orders' }))
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'orders', objectKind: 'node' }])
        expect(screen.getByRole('button', { name: 'Orders' })).toHaveAttribute('aria-pressed', 'true')

        await user.click(screen.getByRole('button', { name: 'writes' }))
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'orders-store', objectKind: 'edge' }])
        expect(screen.getByRole('button', { name: 'Orders' })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByRole('button', { name: 'writes' })).toHaveAttribute('aria-pressed', 'true')

        await user.click(screen.getByRole('button', { name: 'Backend' }))
        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'backend', objectKind: 'group' }])
        expect(screen.getByRole('button', { name: 'Backend' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('clears selection when empty New surface is clicked', () => {
        const { selection } = renderHarness()
        act(() => { selection.replace([{ objectId: 'orders', objectKind: 'node' }]) })

        fireEvent.click(screen.getByLabelText('New diagram'))

        expect(selection.getSelectionSnapshot()).toEqual([])
    })

    it.each([
        ['non-drilldown node', 'Orders', 'orders', 'node'],
        ['edge', 'writes', 'orders-store', 'edge'],
        ['group', 'Backend', 'backend', 'group'],
    ] as const)('selects a focused New %s from keyboard activation', async (_description, label, objectId, objectKind) => {
        const { selection } = renderHarness()
        const user = userEvent.setup()
        const object = screen.getByRole('button', { name: label })

        object.focus()
        await user.keyboard('{Enter}')

        expect(selection.getSelectionSnapshot()).toEqual([{ objectId, objectKind }])
    })

    it('leaves selection unchanged when another persistent tool is active', async () => {
        const { selection, session } = renderHarness()
        const user = userEvent.setup()
        act(() => {
            selection.replace([{ objectId: 'backend', objectKind: 'group' }])
            session.setActiveTool('node:component')
        })

        await user.click(screen.getByRole('button', { name: 'Orders' }))
        fireEvent.click(screen.getByLabelText('New diagram'))

        expect(selection.getSelectionSnapshot()).toEqual([{ objectId: 'backend', objectKind: 'group' }])
    })
})
