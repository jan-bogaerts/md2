import { ThemeProvider } from '@mui/material'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type { DiagramRecord } from '../../../services/diagrams/diagram_index'
import type { DiagramViewSourceSnapshot } from '../../../services/diagrams/diagram_view_service'
import { createAppTheme } from '../../../theme/app_theme'
import { DiagramLegendButton } from './diagram_legend_button'
import { DiagramLegendDetailsEditor } from './diagram_legend_details_editor'

const diagram: DiagramData = {
    edges: [{ from: 'orders', id: 'orders-store', kind: 'connection', to: 'store' }],
    groups: [],
    meta: { description: 'Orders architecture', title: 'Overview', type: 'architecture', version: 1 },
    nodes: [
        { id: 'orders', label: 'Orders', role: 'focal' },
        { id: 'store', label: 'Store', role: 'store' },
    ],
}
const legendDiagram: DiagramData = {
    ...diagram,
    meta: { ...diagram.meta, legend: [{ label: 'Service', role: 'focal' }, { kind: 'connection', label: 'Calls' }] },
}
const record: DiagramRecord = { actionId: 'overview', id: 'diagram-1', label: 'Overview', path: 'design/diagrams/overview.json' }
const theme = createAppTheme('dark')

class DiagramSourceStub extends EventTarget {
    private source: DiagramViewSourceSnapshot | null = null

    getSourceSnapshot = () => this.source

    subscribeSource = (listener: () => void) => {
        this.addEventListener('sourceChanged', listener)

        return () => this.removeEventListener('sourceChanged', listener)
    }

    setSource(source: DiagramViewSourceSnapshot) {
        this.source = source
        this.dispatchEvent(new Event('sourceChanged'))
    }
}

function renderEditor(source: DiagramData, reportValidationError = vi.fn()) {
    const sourceService = new DiagramSourceStub()
    const session = new DiagramEditSessionService(sourceService, undefined, reportValidationError)
    sourceService.setSource({ diagram: source, record })
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    session.start()
    const onClose = vi.fn()
    render(
        <ThemeProvider theme={theme}>
            <DiagramLegendDetailsEditor onClose={onClose} session={session} />
        </ThemeProvider>,
    )

    return { onClose, session }
}

function entryLabelInputs() {
    return within(screen.getByLabelText('Legend entries')).queryAllByRole('textbox')
}

afterEach(cleanup)

describe('DiagramLegendDetailsEditor', () => {
    it('lists explicit entries in legend order with labelled controls', () => {
        renderEditor(legendDiagram)

        expect(entryLabelInputs().map((input) => (input as HTMLInputElement).value)).toEqual(['Service', 'Calls'])
        expect(screen.getByLabelText('Label for focal node')).toBeInTheDocument()
        expect(screen.getByLabelText('Move focal node up')).toBeDisabled()
        expect(screen.getByLabelText('Move connection connection down')).toBeDisabled()
        expect(screen.getByLabelText('Remove focal node')).toBeEnabled()
    })

    it('explains that adding to a derived legend keeps its entries', () => {
        renderEditor(diagram)

        expect(screen.getByText(/derived from the node kinds/)).toBeInTheDocument()
        expect(screen.getByText(/Adding an entry keeps those derived entries/)).toBeInTheDocument()
        expect(entryLabelInputs()).toHaveLength(0)
    })

    it('renames one entry without touching the others', async () => {
        const { session } = renderEditor(legendDiagram)

        await userEvent.clear(screen.getByLabelText('Label for focal node'))
        await userEvent.type(screen.getByLabelText('Label for focal node'), 'Order service')
        await userEvent.tab()

        expect(session.getLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Order service')
        expect(session.getLegendEntryFieldSnapshot('connection:connection', 'label')).toBe('Calls')
        expect(session.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'connection:connection'])
    })

    it('rejects an empty label and restores the stored value', async () => {
        const { session } = renderEditor(legendDiagram)

        await userEvent.clear(screen.getByLabelText('Label for focal node'))
        await userEvent.tab()

        expect(screen.getByText('Label for focal node is required.')).toBeInTheDocument()
        expect(session.getLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Service')
        expect((screen.getByLabelText('Label for focal node') as HTMLInputElement).value).toBe('Service')
    })

    it('adds an entry for an unused semantic and drops it from the picker', async () => {
        const { session } = renderEditor(legendDiagram)

        await userEvent.click(screen.getByLabelText('Add entry for'))
        await userEvent.click(screen.getByRole('option', { name: 'backend node' }))
        await userEvent.clear(screen.getByLabelText('Label for the added entry'))
        await userEvent.type(screen.getByLabelText('Label for the added entry'), 'Database')
        await userEvent.click(screen.getByRole('button', { name: 'Add' }))

        expect(session.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'connection:connection', 'node:backend'])
        expect(session.getLegendEntryFieldSnapshot('node:backend', 'label')).toBe('Database')
        await userEvent.click(screen.getByLabelText('Add entry for'))
        expect(screen.queryByRole('option', { name: 'backend node' })).not.toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'focal node' })).not.toBeInTheDocument()
    })

    it('prefills the type name and allows the label to be edited', async () => {
        const { session } = renderEditor(legendDiagram)

        await userEvent.click(screen.getByLabelText('Add entry for'))
        await userEvent.click(screen.getByRole('option', { name: 'backend node' }))
        expect(screen.getByLabelText('Label for the added entry')).toHaveValue('backend')
        await userEvent.click(screen.getByRole('button', { name: 'Add' }))

        expect(session.getLegendEntryFieldSnapshot('node:backend', 'label')).toBe('backend')
    })

    it('groups diagram-used types behind the checkbox and follows node, edge, and legend changes', async () => {
        const { session } = renderEditor(legendDiagram)

        await userEvent.click(screen.getByLabelText('Add entry for'))
        expect(screen.getByText('Unused types')).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'backend node' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'store node' })).not.toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'call connection' })).not.toBeInTheDocument()
        await userEvent.keyboard('{Escape}')

        await userEvent.click(screen.getByRole('checkbox', { name: 'Include used types' }))
        await userEvent.click(screen.getByLabelText('Add entry for'))
        const usedGroup = screen.getByText('Used types')
        const usedOption = screen.getByRole('option', { name: 'store node' })
        expect(usedGroup.compareDocumentPosition(usedOption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        await userEvent.keyboard('{Escape}')

        act(() => {
            session.setNodeField('store', 'role', 'backend')
            session.setEdgeField('orders-store', 'kind', 'data')
            session.removeLegendEntry('connection:connection')
        })
        await userEvent.click(screen.getByLabelText('Add entry for'))
        expect(screen.getByRole('option', { name: 'store node' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'backend node' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'data connection' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'connection connection' })).toBeInTheDocument()
        await userEvent.keyboard('{Escape}')

        await userEvent.click(screen.getByRole('checkbox', { name: 'Include used types' }))
        await userEvent.click(screen.getByLabelText('Add entry for'))
        expect(screen.queryByText('Used types')).not.toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'backend node' })).not.toBeInTheDocument()
    })

    it('moves types between picker groups when nodes and connections are added', async () => {
        const { session } = renderEditor(legendDiagram)
        await userEvent.click(screen.getByRole('checkbox', { name: 'Include used types' }))

        act(() => {
            session.createNode({ label: 'External', role: 'external' })
            session.createEdge({ from: 'orders', kind: 'data', to: 'store' })
        })
        await userEvent.click(screen.getByLabelText('Add entry for'))
        expect(screen.getByRole('option', { name: 'external node' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'data connection' })).toBeInTheDocument()
        expect(screen.getByText('Used types').compareDocumentPosition(screen.getByRole('option', { name: 'data connection' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('reports when no semantic has been chosen to add', async () => {
        const { session } = renderEditor(legendDiagram)

        await userEvent.click(screen.getByRole('button', { name: 'Add' }))

        expect(screen.getByText('Choose the node kind, node role, or connection kind to add.')).toBeInTheDocument()
        expect(session.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'connection:connection'])
    })

    it('keeps derived entries on add and rejects adding a type already displayed there', async () => {
        const { session } = renderEditor(diagram)

        await userEvent.click(screen.getByRole('checkbox', { name: 'Include used types' }))
        await userEvent.click(screen.getByLabelText('Add entry for'))
        await userEvent.click(screen.getByRole('option', { name: 'Component node kind' }))
        await userEvent.click(screen.getByRole('button', { name: 'Add' }))
        expect(screen.getByText('That node kind, node role, or connection kind already has a legend entry.')).toBeInTheDocument()
        expect(session.getHasExplicitLegendSnapshot()).toBe(false)

        await userEvent.click(screen.getByLabelText('Add entry for'))
        await userEvent.click(screen.getByRole('option', { name: 'backend node' }))
        await userEvent.click(screen.getByRole('button', { name: 'Add' }))
        expect(session.getEditableDiagram()?.meta.legend).toEqual([
            { label: 'Component', nodeKind: 'component' },
            { kind: 'connection', label: 'Connection' },
            { label: 'backend', role: 'backend' },
        ])
    })

    it('reorders entries and shows the new order immediately', async () => {
        const { session } = renderEditor(legendDiagram)

        await userEvent.click(screen.getByLabelText('Move connection connection up'))

        expect(session.getLegendEntryKeysSnapshot()).toEqual(['connection:connection', 'node:focal'])
        expect(entryLabelInputs().map((input) => (input as HTMLInputElement).value)).toEqual(['Calls', 'Service'])
    })

    it('removes an entry without changing nodes or edges', async () => {
        const { session } = renderEditor(legendDiagram)
        const nodes = session.getEditableDiagram()?.nodes
        const edges = session.getEditableDiagram()?.edges

        await userEvent.click(screen.getByLabelText('Remove focal node'))

        expect(session.getLegendEntryKeysSnapshot()).toEqual(['connection:connection'])
        expect(session.getEditableDiagram()?.nodes).toBe(nodes)
        expect(session.getEditableDiagram()?.edges).toBe(edges)
        expect(entryLabelInputs()).toHaveLength(1)
    })

    it('closes through its accessible action', async () => {
        const { onClose } = renderEditor(legendDiagram)

        await userEvent.click(screen.getByRole('button', { name: 'Close' }))

        expect(onClose).toHaveBeenCalledOnce()
    })
})

describe('DiagramLegendButton', () => {
    it('opens the legend editor from the Others toolbox section', async () => {
        const details = { open: vi.fn() }
        render(<ThemeProvider theme={theme}><DiagramLegendButton details={details} /></ThemeProvider>)

        await userEvent.click(screen.getByRole('button', { name: 'Legend' }))

        expect(details.open).toHaveBeenCalledWith({ objectKind: 'legend' })
    })
})
