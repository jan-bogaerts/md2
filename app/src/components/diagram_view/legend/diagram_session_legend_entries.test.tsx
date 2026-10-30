import { ThemeProvider } from '@mui/material'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseDiagramData, type DiagramData } from '../../../services/diagrams/diagram_data'
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
    sourceService.setSource({ diagram: parseDiagramData(JSON.stringify(source)), record })
    session.bindProject({ branch: 'main', id: 'project', rootPath: 'C:/repo' })
    session.start()

    return session
}

const ROW_HEIGHT = 40
const ROW_WIDTH = 200

/** jsdom has no layout, so each legend row reports a stacked rectangle by its position in the entry list. */
function stubLegendRowRects(listLabel: string) {
    return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function rowRect(this: HTMLElement) {
        const list = this.parentElement
        const index = list?.getAttribute('aria-label') === listLabel ? Array.from(list.children).indexOf(this) : 0
        const top = index * ROW_HEIGHT
        const rect = { bottom: top + ROW_HEIGHT, height: ROW_HEIGHT, left: 0, right: ROW_WIDTH, top, width: ROW_WIDTH, x: 0, y: top }

        return { ...rect, toJSON: () => rect }
    })
}

async function dragDownOneRow(handleName: string) {
    const user = userEvent.setup()
    screen.getByRole('button', { name: handleName }).focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowDown}')
    await user.keyboard(' ')
}

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('DiagramSessionLegendEntries', () => {
    it('selects entries by opaque identity and clears selection when the session ends', async () => {
        const session = startSession(legendDiagram)
        const [serviceEntryId, callsEntryId] = session.read.getLegendEntryKeysSnapshot()
        const user = userEvent.setup()
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        await user.click(screen.getByRole('button', { name: 'Select Service' }))
        expect(session.read.getSelectedLegendEntryKeySnapshot()).toBe(serviceEntryId)
        expect(screen.getByRole('button', { name: 'Select Service' })).toHaveAttribute('aria-pressed', 'true')
        act(() => { session.setActiveTool('pan') })
        expect(session.read.getSelectedLegendEntryKeySnapshot()).toBe(serviceEntryId)

        const connection = screen.getByRole('button', { name: 'Select Calls' })
        connection.focus()
        await user.keyboard('{Enter}')
        expect(session.read.getSelectedLegendEntryKeySnapshot()).toBe(callsEntryId)
        expect(connection).toHaveAttribute('aria-pressed', 'true')

        act(() => { session.discard() })
        expect(session.read.getSelectedLegendEntryKeySnapshot()).toBeNull()
    })

    it('offers accessible role formatting and applies one New transaction', async () => {
        const session = startSession(legendDiagram)
        const [serviceEntryId] = session.read.getLegendEntryKeysSnapshot()
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
        await user.click(screen.getByRole('switch', { name: 'Bold' }))
        await user.click(screen.getByRole('button', { name: 'Apply' }))

        expect(session.read.getNodeFormattingSnapshot(serviceEntryId, 'focal')).toMatchObject({
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

        expect(session.read.getConnectionKindFormattingSnapshot('connection')).toBeUndefined()
        expect(session.read.getDirtySnapshot()).toBe(false)
    })

    it('renders explicit session entries in stored order', () => {
        const session = startSession(legendDiagram)
        const [serviceEntryId, callsEntryId] = session.read.getLegendEntryKeysSnapshot()

        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        expect(screen.getByRole('textbox', { name: `Legend label for ${serviceEntryId}` })).toHaveValue('Service')
        expect(screen.getByRole('textbox', { name: `Legend label for ${callsEntryId}` })).toHaveValue('Calls')
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

    it('reflects a renamed entry without re-reading the diagram', () => {
        const session = startSession(legendDiagram)
        const [serviceEntryId] = session.read.getLegendEntryKeysSnapshot()
        const getEditableDiagram = vi.spyOn(session.read, 'getEditableDiagram')
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        act(() => {
            session.legend.setLegendEntryLabel(serviceEntryId, 'Order service')
        })

        expect(screen.getByRole('textbox', { name: `Legend label for ${serviceEntryId}` })).toHaveValue('Order service')
        expect(getEditableDiagram).not.toHaveBeenCalled()
    })

    it('reflects added, removed, and reordered entries immediately', () => {
        const session = startSession(legendDiagram)
        const originalLabels = session.read.getLegendEntryKeysSnapshot().map((id) => session.read.getLegendEntryFieldSnapshot(id, 'label'))
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)
        const entryList = screen.getByLabelText('New diagram legend entries')

        let databaseEntryId = ''
        act(() => { databaseEntryId = session.legend.addLegendEntry({ label: 'Database', role: 'store' }) as string })
        expect(within(entryList).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)).toEqual([...originalLabels, 'Database'])

        act(() => { session.legend.moveLegendEntry(databaseEntryId, 0) })
        expect(within(entryList).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)).toEqual(['Database', ...originalLabels])

        act(() => { session.legend.removeLegendEntry(databaseEntryId) })
        expect(within(entryList).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)).toEqual(originalLabels)
    })

    it('shows a reorder handle in front of each row in edit mode', () => {
        const session = startSession(legendDiagram)
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        expect(screen.getByRole('button', { name: 'Reorder Service' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Reorder Calls' })).toBeInTheDocument()
    })

    it('reorders an explicit legend by keyboard dragging the handle', async () => {
        const session = startSession(legendDiagram)
        const originalEntryIds = session.read.getLegendEntryKeysSnapshot()
        const originalLabels = originalEntryIds.map((id) => session.read.getLegendEntryFieldSnapshot(id, 'label'))
        stubLegendRowRects('New diagram legend entries')
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        await dragDownOneRow('Reorder Service')

        expect(session.read.getLegendEntryKeysSnapshot()).toEqual([originalEntryIds[1], originalEntryIds[0], ...originalEntryIds.slice(2)])
        const entryList = screen.getByLabelText('New diagram legend entries')
        expect(within(entryList).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)).toEqual([
            originalLabels[1], originalLabels[0], ...originalLabels.slice(2),
        ])
    })

})

describe('DiagramLegend session tabs', () => {
    function renderTabbedLegend(session: DiagramEditSessionService | null) {
        const service = new DiagramViewService()

        return render(
            <ThemeProvider theme={theme}>
                <div style={{ height: 400, position: 'relative', width: 300 }}>
                    <DiagramLegend data={layout(parseDiagramData(JSON.stringify(diagram)))} service={service} session={session} />
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
        const [serviceEntryId] = session.read.getLegendEntryKeysSnapshot()
        renderTabbedLegend(session)

        expect(screen.getByRole('textbox', { name: `Legend label for ${serviceEntryId}` })).toHaveValue('Service')
        await userEvent.click(screen.getByRole('button', { name: 'Add legend entry' }))
        expect(diagramObjectDetailsService.getTargetSnapshot()).toEqual({ objectKind: 'legend' })
        diagramObjectDetailsService.close()
        expect(screen.queryByLabelText('Current diagram legend entries')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('tab', { name: 'Current' }))

        expect(screen.getByLabelText('Current diagram legend entries')).toHaveTextContent('ComponentConnection')
        expect(screen.queryByLabelText('New diagram legend entries')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /^Reorder / })).not.toBeInTheDocument()
    })

    it('applies formatting only through the store selected by the Current or New tab', async () => {
        const session = startSession(legendDiagram)
        const [serviceEntryId] = session.read.getLegendEntryKeysSnapshot()
        const service = new DiagramViewService()
        const setCurrentFormatting = vi.spyOn(service, 'setLegendEntryFormatting').mockImplementation(() => undefined)
        const setNewFormatting = vi.spyOn(session.formatting, 'setLegendEntryFormatting')
        const user = userEvent.setup()
        render(
            <ThemeProvider theme={theme}>
                <div style={{ height: 400, position: 'relative', width: 300 }}>
                    <DiagramLegend data={layout(parseDiagramData(JSON.stringify(diagram)))} service={service} session={session} />
                </div>
            </ThemeProvider>,
        )

        await user.click(screen.getByRole('button', { name: 'Format Service' }))
        await user.click(screen.getByRole('switch', { name: 'Bold' }))
        await user.click(screen.getByRole('button', { name: 'Apply' }))

        expect(setNewFormatting).toHaveBeenCalledOnce()
        expect(setNewFormatting).toHaveBeenCalledWith(serviceEntryId, expect.objectContaining({ font: expect.objectContaining({ bold: true }) }))
        expect(setCurrentFormatting).not.toHaveBeenCalled()

        await user.click(screen.getByRole('tab', { name: 'Current' }))
        await user.click(screen.getByRole('button', { name: 'Format Component' }))
        await user.click(screen.getByRole('menuitem', { name: 'focal' }))
        await user.click(screen.getByRole('switch', { name: 'Italic' }))
        await user.click(screen.getByRole('button', { name: 'Apply' }))

        expect(setCurrentFormatting).toHaveBeenCalledOnce()
        expect(setCurrentFormatting).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ font: expect.objectContaining({ italic: true }) }))
        expect(setNewFormatting).toHaveBeenCalledOnce()
    })
})
