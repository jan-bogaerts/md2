import { ThemeProvider } from '@mui/material'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { DiagramEditSessionService } from '../../services/diagrams/diagram_edit_session_service'
import type { DiagramRecord } from '../../services/diagrams/diagram_index'
import type { DiagramViewSourceSnapshot } from '../../services/diagrams/diagram_view_service'
import { layout } from '../../services/diagrams/diagram_layout'
import { createAppTheme } from '../../theme/app_theme'
import { DiagramLegend } from './diagram_legend'
import { DiagramSessionLegendEntries } from './diagram_session_legend_entries'

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
    it('renders explicit session entries in stored order', () => {
        const session = startSession(legendDiagram)

        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        expect(screen.getByLabelText('New diagram legend entries')).toHaveTextContent('ServiceCalls')
    })

    it('derives entries from edited nodes and edges while the diagram has no explicit legend', () => {
        const session = startSession(diagram)

        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        expect(screen.getByLabelText('New diagram legend entries')).toHaveTextContent('focalstoreconnection')
    })

    it('reflects a renamed entry without re-reading the diagram', () => {
        const session = startSession(legendDiagram)
        const getEditableDiagram = vi.spyOn(session, 'getEditableDiagram')
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        act(() => {
            session.setLegendEntryLabel('node:focal', 'Order service')
        })

        expect(screen.getByLabelText('New diagram legend entries')).toHaveTextContent('Order serviceCalls')
        expect(getEditableDiagram).not.toHaveBeenCalled()
    })

    it('reflects added, removed, and reordered entries immediately', () => {
        const session = startSession(legendDiagram)
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)
        const entryList = screen.getByLabelText('New diagram legend entries')

        act(() => {
            session.addLegendEntry({ label: 'Database', role: 'store' })
        })
        expect(entryList).toHaveTextContent('ServiceCallsDatabase')

        act(() => {
            session.moveLegendEntry('node:store', 0)
        })
        expect(entryList).toHaveTextContent('DatabaseServiceCalls')

        act(() => {
            session.removeLegendEntry('node:focal')
        })
        expect(entryList).toHaveTextContent('DatabaseCalls')
    })

    it('falls back to derived entries once the last explicit entry is removed', () => {
        const session = startSession(legendDiagram)
        render(<ThemeProvider theme={theme}><DiagramSessionLegendEntries session={session} /></ThemeProvider>)

        act(() => {
            for (const entryKey of [...session.getLegendEntryKeysSnapshot()]) session.removeLegendEntry(entryKey)
        })

        expect(screen.getByLabelText('New diagram legend entries')).toHaveTextContent('focalstoreconnection')
    })
})

describe('DiagramLegend session tabs', () => {
    function renderTabbedLegend(session: DiagramEditSessionService | null) {
        return render(
            <ThemeProvider theme={theme}>
                <div style={{ height: 400, position: 'relative', width: 300 }}>
                    <DiagramLegend
                        collapsed={false}
                        data={layout(diagram)}
                        onCollapse={vi.fn()}
                        onExpand={vi.fn()}
                        onMove={vi.fn()}
                        position={null}
                        session={session}
                    />
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

        expect(screen.getByLabelText('New diagram legend entries')).toHaveTextContent('ServiceCalls')
        expect(screen.queryByLabelText('Current diagram legend entries')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('tab', { name: 'Current' }))

        expect(screen.getByLabelText('Current diagram legend entries')).toHaveTextContent('focalstoreconnection')
        expect(screen.queryByLabelText('New diagram legend entries')).not.toBeInTheDocument()
    })
})
