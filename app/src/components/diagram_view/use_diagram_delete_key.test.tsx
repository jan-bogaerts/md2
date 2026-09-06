import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import { DiagramGeometryService } from '../../services/diagrams/diagram_geometry_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import {
    DiagramSelectionService, type DiagramSelectionIdentity,
} from '../../services/diagrams/diagram_selection_service'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { DiagramDeleteButton } from './diagram_delete_button'
import { EditableDiagram } from './editable_diagram'
import { DIAGRAM_EDITOR_ROOT_ATTRIBUTE, useDeleteDiagramSelectionOnDeleteKey } from './use_diagram_delete_key'

const EMPTY_SELECTION: readonly DiagramSelectionIdentity[] = Object.freeze([])
const ORDERS: DiagramSelectionIdentity = { objectId: 'orders', objectKind: 'node' }

const diagram: DiagramData = {
    edges: [],
    groups: [],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
}
const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'diagram.json' }

class DiagramSourceStub extends EventTarget {
    private readonly source: DiagramViewSourceSnapshot = { diagram, record }

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }
}

/** Stands in for the selection service so the key handler and the toolbox button share one observed operation. */
class DeleteSelectionStub extends EventTarget {
    private selection: readonly DiagramSelectionIdentity[] = Object.freeze([ORDERS])

    readonly deleteSelection = vi.fn(() => {
        if (this.selection.length === 0) return false

        this.selection = EMPTY_SELECTION
        this.dispatchEvent(new Event('selection'))

        return true
    })

    readonly getSelectionSnapshot = () => this.selection

    readonly subscribeSelection = (listener: () => void) => {
        this.addEventListener('selection', listener)

        return () => this.removeEventListener('selection', listener)
    }
}

/** Mirrors the editor: the hook lives on a root that carries the diagram editor marker attribute. */
function DeleteKeyHarness({ selection }: { selection: DeleteSelectionStub }) {
    useDeleteDiagramSelectionOnDeleteKey(selection)

    return (
        <div {...{ [DIAGRAM_EDITOR_ROOT_ATTRIBUTE]: 'true' }}>
            <button type="button">Orders node</button>
            <input aria-label="Node label" />
            <div role="dialog">
                <button type="button">Dialog action</button>
            </div>
            <DiagramDeleteButton selection={selection} />
        </div>
    )
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init })
    act(() => { window.dispatchEvent(event) })

    return event
}

afterEach(cleanup)

describe('useDeleteDiagramSelectionOnDeleteKey', () => {
    it('deletes the selection when focus sits inside the diagram editor', () => {
        const selection = new DeleteSelectionStub()
        render(<DeleteKeyHarness selection={selection} />)
        screen.getByRole('button', { name: 'Orders node' }).focus()

        const event = pressKey('Delete')

        expect(selection.deleteSelection).toHaveBeenCalledOnce()
        expect(event.defaultPrevented).toBe(true)
    })

    it('deletes the selection when nothing owns focus, because rectangle selection suppresses focus changes', () => {
        const selection = new DeleteSelectionStub()
        render(<DeleteKeyHarness selection={selection} />)

        pressKey('Delete')

        expect(selection.deleteSelection).toHaveBeenCalledOnce()
    })

    it('does nothing while the user edits text or works inside a dialog, menu, or action popup', () => {
        const selection = new DeleteSelectionStub()
        render(<DeleteKeyHarness selection={selection} />)

        screen.getByRole('textbox', { name: 'Node label' }).focus()
        pressKey('Delete')
        expect(selection.deleteSelection).not.toHaveBeenCalled()

        screen.getByRole('button', { name: 'Dialog action' }).focus()
        pressKey('Delete')
        expect(selection.deleteSelection).not.toHaveBeenCalled()
    })

    it('does nothing while focus belongs to unrelated application chrome', () => {
        const selection = new DeleteSelectionStub()
        const outside = document.createElement('button')
        document.body.append(outside)
        render(<DeleteKeyHarness selection={selection} />)
        outside.focus()

        pressKey('Delete')

        expect(selection.deleteSelection).not.toHaveBeenCalled()
        outside.remove()
    })

    it('ignores modified Delete and other keys', () => {
        const selection = new DeleteSelectionStub()
        render(<DeleteKeyHarness selection={selection} />)
        screen.getByRole('button', { name: 'Orders node' }).focus()

        pressKey('Delete', { ctrlKey: true })
        pressKey('Delete', { altKey: true })
        pressKey('Delete', { metaKey: true })
        pressKey('Backspace')

        expect(selection.deleteSelection).not.toHaveBeenCalled()
    })

    it('removes the listener when the editor unmounts', () => {
        const selection = new DeleteSelectionStub()
        const view = render(<DeleteKeyHarness selection={selection} />)

        view.unmount()
        pressKey('Delete')

        expect(selection.deleteSelection).not.toHaveBeenCalled()
    })

    it('uses the same service operation as the toolbox Delete button', () => {
        const selection = new DeleteSelectionStub()
        render(<DeleteKeyHarness selection={selection} />)

        pressKey('Delete')

        expect(selection.deleteSelection).toHaveBeenCalledOnce()
        // The button is disabled now because the shared operation cleared the very same selection.
        expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
    })
})

describe('EditableDiagram Delete key wiring', () => {
    function createServices() {
        const session = new DiagramEditSessionService(new DiagramSourceStub())
        session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
        session.start()

        return {
            geometry: new DiagramGeometryService(session),
            selection: new DiagramSelectionService(session),
            session,
        }
    }

    it('removes the selected node through the real selection service', () => {
        const { geometry, selection, session } = createServices()
        render(<EditableDiagram geometry={geometry} selection={selection} session={session} />)
        act(() => { selection.replace([ORDERS]) })
        screen.getByRole('button', { name: 'Orders' }).focus()

        pressKey('Delete')

        expect(screen.queryByRole('button', { name: 'Orders' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Store' })).toBeInTheDocument()
        expect(selection.getSelectionSnapshot()).toHaveLength(0)
    })
})
