import { ThemeProvider } from '@mui/material'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiagramViewService, type DiagramLegendPosition } from '../../../services/diagrams/diagram_view_service'
import { layout } from '../../../services/diagrams/diagram_layout'
import { createAppTheme } from '../../../theme/app_theme'
import { DiagramLegend } from './diagram_legend'
import { clampLegendPosition } from './diagram_legend_position'

const data = layout({
    edges: [
        { from: 'one', id: 'async-edge', kind: 'async', to: 'two' },
        { from: 'two', id: 'success-edge', kind: 'success', to: 'one' },
    ],
    groups: [],
    meta: { description: 'Description', title: 'Title', type: 'sequence', version: 1 },
    nodes: [
        { id: 'one', label: 'One', role: 'focal' },
        { id: 'two', label: 'Two', role: 'backend' },
    ],
})
const theme = createAppTheme('dark')

function renderLegend(
    position: DiagramLegendPosition | null = null,
    service = new DiagramViewService(),
) {
    if (position) service.moveLegend(position)
    const view = render(
        <ThemeProvider theme={theme}>
            <div aria-label="Legend viewport" style={{ height: 200, position: 'relative', width: 300 }}>
                <DiagramLegend data={data} service={service} />
            </div>
        </ThemeProvider>,
    )

    return { service, ...view }
}

describe('DiagramLegend', () => {
    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('renders node and shared connection samples with canonical labels', () => {
        renderLegend()

        expect(screen.getByLabelText('Diagram legend')).toHaveTextContent('focalbackendasyncsuccess')
        expect(document.querySelector('[data-role="focal"]')).toBeInTheDocument()
        expect(document.querySelector('[data-kind="async"]')).toHaveAttribute('data-arrowhead', 'open')
        expect(document.querySelector('[data-kind="success"]')).toHaveAttribute('data-arrowhead', 'filled')
        expect(document.querySelector('[data-kind="async"] line')).toHaveAttribute('stroke-dasharray', '4 3')
        expect(document.querySelector('[data-kind="async"] line')).toHaveAttribute('stroke-width', '1.2')
        expect(document.querySelector('[data-kind="success"] line')).not.toHaveAttribute('stroke-dasharray')
        expect(document.querySelector('[data-kind="success"] line')).toHaveAttribute('stroke-width', '1.5')
        expect(screen.getByLabelText('Diagram legend entries')).toHaveStyle({ overflowY: 'auto' })
    })

    it('provides accessible collapse control without starting drag', async () => {
        const service = new DiagramViewService()
        const collapseLegend = vi.spyOn(service, 'collapseLegend')
        const moveLegend = vi.spyOn(service, 'moveLegend')
        renderLegend(null, service)
        const user = userEvent.setup()
        const button = screen.getByRole('button', { name: 'Collapse legend' })

        fireEvent.pointerDown(button, { clientX: 20, clientY: 20, pointerId: 1 })
        button.focus()
        await user.keyboard('{Enter}')

        expect(collapseLegend).toHaveBeenCalledTimes(1)
        expect(moveLegend).not.toHaveBeenCalled()
    })

    it('clamps pointer dragging and suppresses its trailing click', () => {
        const service = new DiagramViewService()
        const collapseLegend = vi.spyOn(service, 'collapseLegend')
        const expandLegend = vi.spyOn(service, 'expandLegend')
        const moveLegend = vi.spyOn(service, 'moveLegend')
        renderLegend(null, service)
        const viewport = screen.getByLabelText('Legend viewport')
        const panel = screen.getByLabelText('Diagram legend')
        const header = screen.getByLabelText('Move diagram legend')
        Object.defineProperties(viewport, { clientHeight: { value: 200 }, clientWidth: { value: 300 } })
        Object.defineProperties(panel, { offsetHeight: { value: 80 }, offsetWidth: { value: 100 } })
        vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10 } as DOMRect)
        vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ left: 180, top: 40 } as DOMRect)
        Object.assign(header, {
            hasPointerCapture: vi.fn(() => true),
            releasePointerCapture: vi.fn(),
            setPointerCapture: vi.fn(),
        })

        fireEvent.pointerDown(header, { clientX: 200, clientY: 50, pointerId: 7 })
        fireEvent.pointerMove(header, { clientX: 500, clientY: 400, pointerId: 7 })
        fireEvent.pointerUp(header, { pointerId: 7 })
        fireEvent.click(header)

        expect(moveLegend).toHaveBeenLastCalledWith({ left: 200, top: 120 })
        expect(collapseLegend).not.toHaveBeenCalled()
        expect(expandLegend).not.toHaveBeenCalled()
    })

    it('reclamps a moved panel when observed viewport size changes', () => {
        const observers: ResizeObserverCallback[] = []
        class ResizeObserverMock {
            private readonly elements = new Set<Element>()
            constructor(callback: ResizeObserverCallback) { observers.push(callback) }
            disconnect() { this.elements.clear() }
            observe(element: Element) { this.elements.add(element) }
            unobserve(element: Element) { this.elements.delete(element) }
        }
        vi.stubGlobal('ResizeObserver', ResizeObserverMock)
        const service = new DiagramViewService()
        const moveLegend = vi.spyOn(service, 'moveLegend')
        renderLegend(null, service)
        const viewport = screen.getByLabelText('Legend viewport')
        const panel = screen.getByLabelText('Diagram legend')
        let viewportWidth = 300
        let viewportHeight = 200
        Object.defineProperties(viewport, {
            clientHeight: { configurable: true, get: () => viewportHeight },
            clientWidth: { configurable: true, get: () => viewportWidth },
        })
        Object.defineProperties(panel, { offsetHeight: { value: 80 }, offsetWidth: { value: 100 } })

        act(() => service.moveLegend({ left: 150, top: 100 }))
        viewportWidth = 160
        viewportHeight = 100
        observers.at(-1)?.([], {} as ResizeObserver)

        expect(moveLegend).toHaveBeenLastCalledWith({ left: 60, top: 20 })
    })

    it('clamps oversized and out-of-bounds positions', () => {
        expect(clampLegendPosition({ left: -10, top: 500 }, 100, 80, 120, 40)).toEqual({ left: 0, top: 40 })
    })
})
