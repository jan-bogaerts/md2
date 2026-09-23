import { ThemeProvider } from '@mui/material'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import { DiagramViewService, type DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { layout } from '../../services/diagrams/diagram_layout'
import { createAppTheme } from '../../theme/app_theme'
import { DiagramLegend } from './diagram_legend'
import { DiagramSessionLegendEntries } from './diagram_session_legend_entries'
import { diagramObjectDetailsService } from './diagram_object_details_service'

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
    it('renames a derived row inline, rejects blank text, and removes it without reappearing', async () => {
        const session = startSession(diagram)
        const user = userEvent.setup()
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)
        const label = screen.getByRole('textbox', { name: 'Legend label for node:focal' })

        await user.clear(label)
        await user.tab()
        expect(screen.getByText('Label is required.')).toBeInTheDocument()
        expect(session.getHasExplicitLegendSnapshot()).toBe(false)

        await user.clear(label)
        await user.type(label, 'Service')
        await user.tab()
        expect(session.getLegendEntryFieldSnapshot('node:focal', 'label')).toBe('Service')
        await user.click(screen.getByRole('button', { name: 'Remove Service' }))
        expect(session.getLegendEntryKeysSnapshot()).not.toContain('node:focal')
        expect(screen.queryByRole('textbox', { name: 'Legend label for node:focal' })).not.toBeInTheDocument()
    })

    it('offers accessible role formatting and applies one New transaction', async () => {
        const session = startSession(legendDiagram)
        const user = userEvent.setup()
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        const gear = screen.getByRole('button', { name: 'Format Service' })
        expect(gear).toBeInTheDocument()
        await user.click(gear)
        expect(screen.getByRole('textbox', { name: 'Font family' })).toBeInTheDocument()
        expect(screen.getByRole('slider', { name: 'Font size' })).toHaveAttribute('aria-valuemin', '1')
        expect(screen.getByText('Font color')).toBeInTheDocument()
        expect(screen.getByText('Fill color')).toBeInTheDocument()
        expect(screen.getByText('Border color')).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Border style' })).toBeInTheDocument()
        expect(screen.getByRole('slider', { name: 'Border thickness' })).toHaveAttribute('aria-valuemax', '20')
        expect(screen.getByRole('slider', { name: 'Corner radius' })).toHaveAttribute('aria-valuemax', '100')
        expect(screen.getByRole('combobox', { name: 'Content position' })).toBeInTheDocument()

        await user.type(screen.getByRole('textbox', { name: 'Font family' }), 'Inter')
        await user.click(screen.getByRole('button', { name: 'Use custom color for Fill color' }))
        await user.click(screen.getByRole('button', { name: 'Use colour #1976d2' }))
        await user.click(screen.getByRole('checkbox', { name: 'Bold' }))
        await user.click(screen.getByRole('button', { name: 'Apply' }))

        expect(session.getNodeRoleFormattingSnapshot('focal')).toMatchObject({
            box: { contentPosition: 'center', fillColor: '#1976d2' },
            font: { bold: true, family: 'Inter' },
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

        expect(screen.getByRole('textbox', { name: 'Legend label for node:focal' })).toHaveValue('focal')
        expect(screen.getByRole('textbox', { name: 'Legend label for node:store' })).toHaveValue('store')
        expect(screen.getByRole('textbox', { name: 'Legend label for connection:connection' })).toHaveValue('connection')
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
        expect(screen.getByLabelText('Diagram legend entries')).toHaveTextContent('focalstoreconnection')
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

        expect(screen.getByLabelText('Current diagram legend entries')).toHaveTextContent('focalstoreconnection')
        expect(screen.queryByLabelText('New diagram legend entries')).not.toBeInTheDocument()
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
        await user.click(screen.getByRole('checkbox', { name: 'Bold' }))
        await user.click(screen.getByRole('button', { name: 'Apply' }))

        expect(setNewFormatting).toHaveBeenCalledOnce()
        expect(setNewFormatting).toHaveBeenCalledWith('focal', expect.objectContaining({ font: expect.objectContaining({ bold: true }) }))
        expect(setCurrentFormatting).not.toHaveBeenCalled()

        await user.click(screen.getByRole('tab', { name: 'Current' }))
        await user.click(screen.getByRole('button', { name: 'Format focal' }))
        await user.click(screen.getByRole('checkbox', { name: 'Italic' }))
        await user.click(screen.getByRole('button', { name: 'Apply' }))

        expect(setCurrentFormatting).toHaveBeenCalledOnce()
        expect(setCurrentFormatting).toHaveBeenCalledWith('focal', expect.objectContaining({ font: expect.objectContaining({ italic: true }) }))
        expect(setNewFormatting).toHaveBeenCalledOnce()
    })
})
