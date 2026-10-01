import { ThemeProvider } from '@mui/material'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type { DiagramRecord } from '../../../services/diagrams/diagram_index'
import { DiagramViewService, type DiagramViewSourceSnapshot } from '../../../services/diagrams/diagram_view_service'
import { layout } from '../../../services/diagrams/diagram_layout'
import { createAppTheme } from '../../../theme/app_theme'
import { MARKDOWN_STYLE_PRESETS } from '../../../theme/theme_config'
import { DiagramLegend } from './diagram_legend'
import { DiagramSessionLegendEntries } from './diagram_session_legend_entries'
import { diagramObjectDetailsService } from '../details/diagram_object_details_service'

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

function startSession(source: DiagramData) {
    const sourceService = new DiagramSourceStub()
    const session = new DiagramEditSessionService(sourceService)
    sourceService.setSource({ diagram: source, record })
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    session.start()

    return session
}

afterEach(cleanup)

describe('DiagramSessionLegendEntries', () => {
    it('selects semantic entries by pointer and keyboard, then clears removed and ended selection', async () => {
        const session = startSession(legendDiagram)
        const user = userEvent.setup()
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        await user.click(screen.getByRole('button', { name: 'Select Service' }))
        expect(session.getSelectedLegendEntryKeySnapshot()).toBe('node:focal')
        expect(screen.getByRole('button', { name: 'Select Service' })).toHaveAttribute('aria-pressed', 'true')
        act(() => { session.setActiveTool('pan') })
        expect(session.getSelectedLegendEntryKeySnapshot()).toBe('node:focal')

        const connection = screen.getByRole('button', { name: 'Select Calls' })
        connection.focus()
        await user.keyboard('{Enter}')
        expect(session.getSelectedLegendEntryKeySnapshot()).toBe('connection:connection')
        expect(connection).toHaveAttribute('aria-pressed', 'true')

        await user.click(screen.getByRole('button', { name: 'Remove Calls' }))
        expect(session.getSelectedLegendEntryKeySnapshot()).toBeNull()
        await user.click(screen.getByRole('button', { name: 'Select Service' }))
        act(() => { session.discard() })
        expect(session.getSelectedLegendEntryKeySnapshot()).toBeNull()
    })

    it('renames a derived row inline, rejects blank text, and removes it without reappearing', async () => {
        const session = startSession(diagram)
        const user = userEvent.setup()
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)
        const label = screen.getByRole('textbox', { name: 'Legend label for nodeKind:component' })

        await user.clear(label)
        await user.tab()
        expect(screen.getByText('Label is required.')).toBeInTheDocument()
        expect(session.getHasExplicitLegendSnapshot()).toBe(false)

        await user.clear(label)
        await user.type(label, 'Service')
        await user.tab()
        expect(session.getLegendEntryFieldSnapshot('nodeKind:component', 'label')).toBe('Service')
        await user.click(screen.getByRole('button', { name: 'Remove Service' }))
        expect(session.getLegendEntryKeysSnapshot()).not.toContain('nodeKind:component')
        expect(screen.queryByRole('textbox', { name: 'Legend label for nodeKind:component' })).not.toBeInTheDocument()
    })

    it('offers accessible role formatting and applies one New transaction', async () => {
        const session = startSession(legendDiagram)
        const user = userEvent.setup()
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        const gear = screen.getByRole('button', { name: 'Format Service' })
        expect(gear).toBeInTheDocument()
        await user.click(gear)
        expect(screen.getByRole('combobox', { name: 'Font family' })).toBeInTheDocument()
        expect(screen.getByRole('slider', { name: 'Font size' })).toHaveAttribute('aria-valuemin', '1')
        expect(screen.getByRole('button', { name: 'Font color' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Fill color' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Border color' })).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Border style' })).toBeInTheDocument()
        expect(screen.getByRole('slider', { name: 'Border thickness' })).toHaveAttribute('aria-valuemax', '20')
        expect(screen.getByRole('slider', { name: 'Corner radius' })).toHaveAttribute('aria-valuemax', '100')
        expect(screen.getByRole('combobox', { name: 'Content position' })).toBeInTheDocument()

        await user.click(screen.getByRole('combobox', { name: 'Font family' }))
        await user.click(screen.getByRole('option', { name: 'Modern' }))
        await user.click(screen.getByRole('button', { name: 'Fill color' }))
        await user.click(screen.getByRole('button', { name: 'Use colour #1976d2' }))
        await user.keyboard('{Escape}')
        await user.click(screen.getByRole('switch', { name: 'Bold' }))
        await user.click(screen.getByRole('button', { name: 'Apply' }))

        expect(session.getNodeRoleFormattingSnapshot('focal')).toMatchObject({
            box: { contentPosition: 'center', fillColor: '#1976d2' },
            font: { bold: true, family: MARKDOWN_STYLE_PRESETS.modern.body.fontFamily },
        })
    })

    it('offers all connection markers and Cancel changes nothing', async () => {
        const session = startSession(legendDiagram)
        const user = userEvent.setup()
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        await user.click(screen.getByRole('button', { name: 'Format Calls' }))
        const startMarker = screen.getByRole('combobox', { name: 'Start marker' })
        await user.click(startMarker)
        for (const marker of ['None', 'Filled arrow', 'Open arrow', 'Circle', 'Diamond']) {
            expect(screen.getByRole('option', { name: marker })).toBeInTheDocument()
        }
        await user.keyboard('{Escape}')
        await user.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(session.getConnectionKindFormattingSnapshot('connection')).toBeUndefined()
        expect(session.getDirtySnapshot()).toBe(false)
    })

    it('renders explicit session entries in stored order', () => {
        const session = startSession(legendDiagram)

        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        expect(screen.getByRole('textbox', { name: 'Legend label for node:focal' })).toHaveValue('Service')
        expect(screen.getByRole('textbox', { name: 'Legend label for connection:connection' })).toHaveValue('Calls')
    })

    it('derives entries from edited nodes and edges while the diagram has no explicit legend', () => {
        const session = startSession(diagram)

        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        expect(screen.getByRole('textbox', { name: 'Legend label for nodeKind:component' })).toHaveValue('Component')
        expect(screen.getByRole('textbox', { name: 'Legend label for connection:connection' })).toHaveValue('Connection')
    })

    it('updates derived labels when a used kind changes and preserves other rows', () => {
        const flowDiagram: DiagramData = {
            edges: [], groups: [],
            meta: { description: 'Flow', preset: 'flowchart', title: 'Flow', type: 'flow', version: 1 },
            nodes: [
                { id: 'first', kind: 'start', label: 'First', role: 'focal' },
                { id: 'second', kind: 'step', label: 'Second', role: 'focal' },
            ],
        }
        const session = startSession(flowDiagram)
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        expect(screen.getByRole('textbox', { name: 'Legend label for nodeKind:start' })).toHaveValue('Start')
        expect(screen.getByRole('textbox', { name: 'Legend label for nodeKind:step' })).toHaveValue('Step')
        act(() => { session.setNodeField('second', 'kind', 'end') })
        expect(screen.queryByRole('textbox', { name: 'Legend label for nodeKind:step' })).not.toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Legend label for nodeKind:end' })).toHaveValue('End')
        expect(screen.getByRole('textbox', { name: 'Legend label for nodeKind:start' })).toHaveValue('Start')
    })

    it('tracks added, changed, and removed connection kinds in New legend', () => {
        const session = startSession(diagram)
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        act(() => { session.setEdgeField('orders-store', 'kind', 'data') })
        expect(screen.queryByRole('textbox', { name: 'Legend label for connection:connection' })).not.toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Legend label for connection:data' })).toHaveValue('Data')
        act(() => { session.createEdge({ from: 'orders', kind: 'async', to: 'store' }) })
        expect(screen.getByRole('textbox', { name: 'Legend label for connection:async' })).toHaveValue('Async')
        act(() => { session.removeObjects([{ objectId: 'orders-store', objectKind: 'edge' }]) })
        expect(screen.queryByRole('textbox', { name: 'Legend label for connection:data' })).not.toBeInTheDocument()
    })

    it('disables formatting for a saved node kind with no used nodes', () => {
        const source: DiagramData = {
            edges: [], groups: [],
            meta: { description: 'Empty', legend: [{ label: 'Module', nodeKind: 'component' }], title: 'Empty', type: 'architecture', version: 1 },
            nodes: [],
        }
        const session = startSession(source)
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        expect(screen.getByRole('button', { name: 'Format Module' })).toBeDisabled()
    })

    it('chooses one used role before formatting a kind shared by several roles', async () => {
        const session = startSession(diagram)
        const user = userEvent.setup()
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        await user.click(screen.getByRole('button', { name: 'Format Component' }))
        expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
        await user.click(screen.getByRole('menuitem', { name: 'store' }))
        await user.click(screen.getByRole('switch', { name: 'Bold' }))
        await user.click(screen.getByRole('button', { name: 'Apply' }))

        expect(session.getNodeRoleFormattingSnapshot('store')?.font?.bold).toBe(true)
        expect(session.getNodeRoleFormattingSnapshot('focal')).toBeUndefined()
    })

    it('reflects a renamed entry without re-reading the diagram', () => {
        const session = startSession(legendDiagram)
        const getEditableDiagram = vi.spyOn(session, 'getEditableDiagram')
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        act(() => {
            session.setLegendEntryLabel('node:focal', 'Order service')
        })

        expect(screen.getByRole('textbox', { name: 'Legend label for node:focal' })).toHaveValue('Order service')
        expect(getEditableDiagram).not.toHaveBeenCalled()
    })

    it('reflects added, removed, and reordered entries immediately', () => {
        const session = startSession(legendDiagram)
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)
        const entryList = screen.getByLabelText('New diagram legend entries')

        act(() => {
            session.addLegendEntry({ label: 'Database', role: 'store' })
        })
        expect(within(entryList).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)).toEqual(['Service', 'Calls', 'Database'])

        act(() => {
            session.moveLegendEntry('node:store', 0)
        })
        expect(within(entryList).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)).toEqual(['Database', 'Service', 'Calls'])

        act(() => {
            session.removeLegendEntry('node:focal')
        })
        expect(within(entryList).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)).toEqual(['Database', 'Calls'])
    })

    it('keeps the New legend empty once the last explicit entry is removed', () => {
        const session = startSession(legendDiagram)
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        act(() => {
            for (const entryKey of [...session.getLegendEntryKeysSnapshot()]) session.removeLegendEntry(entryKey)
        })

        expect(within(screen.getByLabelText('New diagram legend entries')).queryAllByRole('textbox')).toHaveLength(0)
    })
})

describe('DiagramLegend session tabs', () => {
    function renderTabbedLegend(session: DiagramEditSessionService | null) {
        const service = new DiagramViewService()

        return render(
            <ThemeProvider theme={theme}>
                <div style={{ height: 400, position: 'relative', width: 300 }}>
                    <DiagramLegend data={layout(diagram)} service={service} session={session} />
                </div>
            </ThemeProvider>,
        )
    }

    it('offers no tabs and one entry list when no edit session is active', () => {
        renderTabbedLegend(null)

        expect(screen.queryByLabelText('Diagram legend sides')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Diagram legend entries')).toHaveTextContent('ComponentConnection')
    })

    it('shows the New legend first and keeps Current reachable through its tab', async () => {
        const session = startSession(legendDiagram)
        renderTabbedLegend(session)

        expect(screen.getByRole('textbox', { name: 'Legend label for node:focal' })).toHaveValue('Service')
        await userEvent.click(screen.getByRole('button', { name: 'Add legend entry' }))
        expect(diagramObjectDetailsService.getTargetSnapshot()).toEqual({ objectKind: 'legend' })
        diagramObjectDetailsService.close()
        expect(screen.queryByLabelText('Current diagram legend entries')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('tab', { name: 'Current' }))

        expect(screen.getByLabelText('Current diagram legend entries')).toHaveTextContent('ComponentConnection')
        expect(screen.queryByLabelText('New diagram legend entries')).not.toBeInTheDocument()
    })

    it('keeps Current on saved labels while New follows edited kinds', async () => {
        const flowDiagram: DiagramData = {
            edges: [], groups: [],
            meta: { description: 'Flow', preset: 'flowchart', title: 'Flow', type: 'flow', version: 1 },
            nodes: [{ id: 'first', kind: 'start', label: 'First', role: 'focal' }],
        }
        const session = startSession(flowDiagram)
        const service = new DiagramViewService()
        render(
            <ThemeProvider theme={theme}>
                <DiagramLegend data={layout(flowDiagram)} service={service} session={session} />
            </ThemeProvider>,
        )

        act(() => { session.setNodeField('first', 'kind', 'end') })
        expect(screen.getByRole('textbox', { name: 'Legend label for nodeKind:end' })).toHaveValue('End')
        await userEvent.click(screen.getByRole('tab', { name: 'Current' }))
        expect(screen.getByLabelText('Current diagram legend entries')).toHaveTextContent('Start')
    })

    it('applies formatting only through the store selected by the Current or New tab', async () => {
        const session = startSession(legendDiagram)
        const service = new DiagramViewService()
        const setCurrentFormatting = vi.spyOn(service, 'setNodeRoleFormatting').mockImplementation(() => undefined)
        const setNewFormatting = vi.spyOn(session, 'setNodeRoleFormatting')
        const user = userEvent.setup()
        render(
            <ThemeProvider theme={theme}>
                <div style={{ height: 400, position: 'relative', width: 300 }}>
                    <DiagramLegend data={layout(diagram)} service={service} session={session} />
                </div>
            </ThemeProvider>,
        )

        await user.click(screen.getByRole('button', { name: 'Format Service' }))
        await user.click(screen.getByRole('switch', { name: 'Bold' }))
        await user.click(screen.getByRole('button', { name: 'Apply' }))

        expect(setNewFormatting).toHaveBeenCalledOnce()
        expect(setNewFormatting).toHaveBeenCalledWith('focal', expect.objectContaining({ font: expect.objectContaining({ bold: true }) }))
        expect(setCurrentFormatting).not.toHaveBeenCalled()

        await user.click(screen.getByRole('tab', { name: 'Current' }))
        await user.click(screen.getByRole('button', { name: 'Format Component' }))
        await user.click(screen.getByRole('menuitem', { name: 'focal' }))
        await user.click(screen.getByRole('switch', { name: 'Italic' }))
        await user.click(screen.getByRole('button', { name: 'Apply' }))

        expect(setCurrentFormatting).toHaveBeenCalledOnce()
        expect(setCurrentFormatting).toHaveBeenCalledWith('focal', expect.objectContaining({ font: expect.objectContaining({ italic: true }) }))
        expect(setNewFormatting).toHaveBeenCalledOnce()
    })
})
