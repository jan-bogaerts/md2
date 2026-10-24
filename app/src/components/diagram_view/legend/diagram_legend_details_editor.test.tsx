import { ThemeProvider } from '@mui/material'
import { cleanup, render, screen } from '@testing-library/react'
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

afterEach(cleanup)

async function chooseType(name: string) {
    await userEvent.click(screen.getByLabelText('Add entry for'))
    await userEvent.click(screen.getByRole('option', { name }))
}

describe('DiagramLegendDetailsEditor', () => {
    it('shows only the add form without existing entries or a used-types checkbox', () => {
        renderEditor(legendDiagram)

        expect(screen.queryByLabelText('Legend entries')).not.toBeInTheDocument()
        expect(screen.queryByDisplayValue('Service')).not.toBeInTheDocument()
        expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Add entry for')).toBeInTheDocument()
    })

    it('explains that adding to a derived legend keeps its entries', () => {
        renderEditor(diagram)

        expect(screen.getByText(/derived from the node kinds/)).toBeInTheDocument()
        expect(screen.getByText(/Adding an entry keeps those derived entries/)).toBeInTheDocument()
    })

    it('lists used, unused, and already-in-legend types in the picker', async () => {
        renderEditor(legendDiagram)

        await userEvent.click(screen.getByLabelText('Add entry for'))

        expect(screen.getByRole('option', { name: 'backend node' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'store node' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'focal node' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Component node kind' })).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'connection connection' })).toBeInTheDocument()
    })

    it('adds the chosen entry with an edited label and closes', async () => {
        const { onClose, session } = renderEditor(legendDiagram)

        await chooseType('backend node')
        await userEvent.clear(screen.getByLabelText('Label for the added entry'))
        await userEvent.type(screen.getByLabelText('Label for the added entry'), 'Database')
        await userEvent.click(screen.getByRole('button', { name: 'Add' }))

        expect(session.read.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'connection:connection', 'node:backend'])
        expect(session.read.getLegendEntryFieldSnapshot('node:backend', 'label')).toBe('Database')
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('prefills the type name as label', async () => {
        const { session } = renderEditor(legendDiagram)

        await chooseType('backend node')
        expect(screen.getByLabelText('Label for the added entry')).toHaveValue('backend')
        await userEvent.click(screen.getByRole('button', { name: 'Add' }))

        expect(session.read.getLegendEntryFieldSnapshot('node:backend', 'label')).toBe('backend')
    })

    it('cancels without changing the legend', async () => {
        const { onClose, session } = renderEditor(legendDiagram)

        await chooseType('backend node')
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(onClose).toHaveBeenCalledOnce()
        expect(session.read.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'connection:connection'])
        expect(session.read.getDirtySnapshot()).toBe(false)
    })

    it('reports when no type has been chosen and stays open', async () => {
        const { onClose, session } = renderEditor(legendDiagram)

        await userEvent.click(screen.getByRole('button', { name: 'Add' }))

        expect(screen.getByText('Choose the node kind, node role, or connection kind to add.')).toBeInTheDocument()
        expect(session.read.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'connection:connection'])
        expect(onClose).not.toHaveBeenCalled()
    })

    it('rejects a type already in the legend and stays open', async () => {
        const { onClose, session } = renderEditor(legendDiagram)

        await chooseType('focal node')
        await userEvent.click(screen.getByRole('button', { name: 'Add' }))

        expect(screen.getByText('That node kind, node role, or connection kind already has a legend entry.')).toBeInTheDocument()
        expect(session.read.getLegendEntryKeysSnapshot()).toEqual(['node:focal', 'connection:connection'])
        expect(onClose).not.toHaveBeenCalled()
    })

    it('keeps derived entries on add and rejects a type already displayed there', async () => {
        const { onClose, session } = renderEditor(diagram)

        await chooseType('Component node kind')
        await userEvent.click(screen.getByRole('button', { name: 'Add' }))
        expect(screen.getByText('That node kind, node role, or connection kind already has a legend entry.')).toBeInTheDocument()
        expect(session.read.getHasExplicitLegendSnapshot()).toBe(false)

        await chooseType('backend node')
        await userEvent.click(screen.getByRole('button', { name: 'Add' }))
        expect(session.read.getEditableDiagram()?.meta.legend).toEqual([
            { label: 'Component', nodeKind: 'component' },
            { kind: 'connection', label: 'Connection' },
            { label: 'backend', role: 'backend' },
        ])
        expect(onClose).toHaveBeenCalledOnce()
    })
})

describe('DiagramLegendButton', () => {
    it('opens the add legend entry dialog from the Others toolbox section', async () => {
        const details = { open: vi.fn() }
        render(<ThemeProvider theme={theme}><DiagramLegendButton details={details} /></ThemeProvider>)

        await userEvent.click(screen.getByRole('button', { name: 'Legend' }))

        expect(details.open).toHaveBeenCalledWith({ objectKind: 'legend' })
    })
})
