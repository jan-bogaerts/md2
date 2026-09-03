import { ThemeProvider } from '@mui/material'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramLegendPosition } from '../../services/diagrams/diagram_view_service'
import { layout } from '../../services/diagrams/diagram_layout'
import { createAppTheme } from '../../theme/app_theme'
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
    callbacks = { onCollapse: vi.fn(), onExpand: vi.fn(), onMove: vi.fn() },
) {
    const view = render(
        <ThemeProvider theme={theme}>
            <div aria-label="Legend viewport" style={{ height: 200, position: 'relative', width: 300 }}>
                <DiagramLegend
                    collapsed={false}
                    data={data}
                    onCollapse={callbacks.onCollapse}
                    onExpand={callbacks.onExpand}
                    onMove={callbacks.onMove}
                    position={position}
                />
            </div>
        </ThemeProvider>,
    )

    return { ...callbacks, ...view }
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
        const callbacks = { onCollapse: vi.fn(), onExpand: vi.fn(), onMove: vi.fn() }
        renderLegend(null, callbacks)
        const user = userEvent.setup()
        const button = screen.getByRole('button', { name: 'Collapse legend' })

        fireEvent.pointerDown(button, { clientX: 20, clientY: 20, pointerId: 1 })
        button.focus()
        await user.keyboard('{Enter}')

        expect(callbacks.onCollapse).toHaveBeenCalledTimes(1)
        expect(callbacks.onMove).not.toHaveBeenCalled()
    })

    it('clamps pointer dragging and suppresses its trailing click', () => {
        const callbacks = { onCollapse: vi.fn(), onExpand: vi.fn(), onMove: vi.fn() }
        renderLegend(null, callbacks)
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

        expect(callbacks.onMove).toHaveBeenLastCalledWith({ left: 200, top: 120 })
        expect(callbacks.onCollapse).not.toHaveBeenCalled()
        expect(callbacks.onExpand).not.toHaveBeenCalled()
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
        const callbacks = { onCollapse: vi.fn(), onExpand: vi.fn(), onMove: vi.fn() }
        const view = renderLegend(null, callbacks)
        const viewport = screen.getByLabelText('Legend viewport')
        const panel = screen.getByLabelText('Diagram legend')
        let viewportWidth = 300
        let viewportHeight = 200
        Object.defineProperties(viewport, {
            clientHeight: { configurable: true, get: () => viewportHeight },
            clientWidth: { configurable: true, get: () => viewportWidth },
        })
        Object.defineProperties(panel, { offsetHeight: { value: 80 }, offsetWidth: { value: 100 } })

        view.rerender(
            <ThemeProvider theme={theme}>
                <div aria-label="Legend viewport" style={{ height: 200, position: 'relative', width: 300 }}>
                    <DiagramLegend {...callbacks} collapsed={false} data={data} position={{ left: 150, top: 100 }} />
                </div>
            </ThemeProvider>,
        )
        viewportWidth = 160
        viewportHeight = 100
        observers.at(-1)?.([], {} as ResizeObserver)

        expect(callbacks.onMove).toHaveBeenLastCalledWith({ left: 60, top: 20 })
    })

    it('clamps oversized and out-of-bounds positions', () => {
        expect(clampLegendPosition({ left: -10, top: 500 }, 100, 80, 120, 40)).toEqual({ left: 0, top: 40 })
    })
})
