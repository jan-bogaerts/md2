import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagramData } from '../../services/diagrams/diagram_data'
import { layout } from '../../services/diagrams/diagram_layout'
import { DiagramViewService } from '../../services/diagrams/diagram_view_service'
import {
    DEFAULT_DIAGRAM_ZOOM,
    DIAGRAM_ZOOM_STEP,
    MAXIMUM_DIAGRAM_ZOOM,
    MINIMUM_DIAGRAM_ZOOM,
} from '../../services/diagrams/diagram_zoom'
import { DiagramCurrentViewport } from './diagram_current_viewport'

const diagram: DiagramData = {
    edges: [],
    groups: [],
    meta: { description: 'Current diagram', title: 'Current', type: 'architecture', version: 1 },
    nodes: [{ id: 'orders', label: 'Orders', role: 'focal' }],
}

function renderCurrentViewport(onSelect = vi.fn()) {
    const service = new DiagramViewService()
    render(<DiagramCurrentViewport data={layout(diagram)} onSelect={onSelect} service={service} />)
    const scroller = screen.getByLabelText('Current diagram scroller')
    scroller.scrollLeft = 120
    scroller.scrollTop = 80

    return { onSelect, scroller, service }
}

function dispatchWheel(scroller: HTMLElement, options: WheelEventInit) {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...options })
    act(() => { scroller.dispatchEvent(event) })

    return event
}

afterEach(cleanup)

describe('DiagramCurrentViewport', () => {
    it('scales Current visually, keeps viewport center, and preserves item activation', () => {
        const service = new DiagramViewService()
        const onSelect = vi.fn()
        render(<DiagramCurrentViewport data={layout(diagram)} onSelect={onSelect} service={service} />)
        const scroller = screen.getByLabelText('Current diagram scroller')
        const slider = screen.getByRole('slider', { name: 'Current diagram zoom' })
        expect(scroller).not.toContainElement(slider)
        Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: 400 })
        Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 200 })
        scroller.scrollLeft = 100
        scroller.scrollTop = 50

        act(() => { service.setViewportScale(1.5) })

        expect(screen.getByTestId('current-diagram-zoom-surface')).toHaveStyle({ zoom: '1.5' })
        expect(scroller.scrollLeft).toBe(250)
        expect(scroller.scrollTop).toBe(125)

        fireEvent.click(screen.getByRole('button', { name: 'Orders' }))
        expect(onSelect).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ id: 'orders' }))
    })

    it('zooms one supported step in each Ctrl-wheel direction and preserves visible center', () => {
        const { scroller, service } = renderCurrentViewport()
        Object.defineProperties(scroller, {
            clientHeight: { configurable: true, value: 200 },
            clientWidth: { configurable: true, value: 400 },
        })
        scroller.scrollLeft = 100
        scroller.scrollTop = 50

        const zoomInEvent = dispatchWheel(scroller, { ctrlKey: true, deltaY: -1 })
        const zoomedScale = DEFAULT_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP

        expect(zoomInEvent.defaultPrevented).toBe(true)
        expect(service.getViewportScaleSnapshot()).toBe(zoomedScale)
        expect(scroller.scrollLeft).toBe((100 + 200) * zoomedScale - 200)
        expect(scroller.scrollTop).toBe((50 + 100) * zoomedScale - 100)

        const zoomOutEvent = dispatchWheel(scroller, { ctrlKey: true, deltaY: 1 })

        expect(zoomOutEvent.defaultPrevented).toBe(true)
        expect(service.getViewportScaleSnapshot()).toBe(1)
        expect(scroller.scrollLeft).toBe(100)
        expect(scroller.scrollTop).toBe(50)
    })

    it('uses the configured minimum step and prevents Ctrl-wheel defaults at both bounds', () => {
        const { scroller, service } = renderCurrentViewport()
        act(() => { service.setViewportScale(MINIMUM_DIAGRAM_ZOOM) })

        const minimumEvent = dispatchWheel(scroller, { ctrlKey: true, deltaY: 1 })
        expect(minimumEvent.defaultPrevented).toBe(true)
        expect(service.getViewportScaleSnapshot()).toBe(MINIMUM_DIAGRAM_ZOOM)

        dispatchWheel(scroller, { ctrlKey: true, deltaY: -1 })
        expect(service.getViewportScaleSnapshot()).toBe(MINIMUM_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP)

        act(() => { service.setViewportScale(MAXIMUM_DIAGRAM_ZOOM) })
        const maximumEvent = dispatchWheel(scroller, { ctrlKey: true, deltaY: -1 })
        expect(maximumEvent.defaultPrevented).toBe(true)
        expect(service.getViewportScaleSnapshot()).toBe(MAXIMUM_DIAGRAM_ZOOM)
    })

    it('leaves unmodified and zero-delta wheel events available for normal scrolling', () => {
        const { scroller, service } = renderCurrentViewport()

        const unmodifiedEvent = dispatchWheel(scroller, { deltaY: 20 })
        const zeroDeltaEvent = dispatchWheel(scroller, { ctrlKey: true, deltaY: 0 })

        expect(unmodifiedEvent.defaultPrevented).toBe(false)
        expect(zeroDeltaEvent.defaultPrevented).toBe(false)
        expect(service.getViewportScaleSnapshot()).toBe(1)
    })

    it('scrolls Current with the pointer when a drag starts on empty diagram background', () => {
        const { scroller } = renderCurrentViewport()

        fireEvent.pointerDown(scroller, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 260, clientY: 170, pointerId: 1 })
        fireEvent.pointerUp(scroller, { pointerId: 1 })

        expect(scroller.scrollLeft).toBe(160)
        expect(scroller.scrollTop).toBe(110)
    })

    it('ignores a drag that starts on a diagram item and keeps its click opening the item menu', () => {
        const { onSelect, scroller } = renderCurrentViewport()
        const node = screen.getByRole('button', { name: 'Orders' })

        fireEvent.pointerDown(node, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 200, clientY: 100, pointerId: 1 })
        fireEvent.pointerUp(scroller, { pointerId: 1 })

        expect(scroller.scrollLeft).toBe(120)
        expect(scroller.scrollTop).toBe(80)

        fireEvent.click(node)
        expect(onSelect).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ id: 'orders' }))
    })

    it('restores the scroll position recorded at pointer down when Escape cancels the pan', () => {
        const { scroller } = renderCurrentViewport()

        fireEvent.pointerDown(scroller, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 200, clientY: 100, pointerId: 1 })
        fireEvent.keyDown(window, { key: 'Escape' })

        expect(scroller.scrollLeft).toBe(120)
        expect(scroller.scrollTop).toBe(80)
    })

    it('opens nothing on the click that follows a pan past the drag threshold', () => {
        const { onSelect, scroller } = renderCurrentViewport()

        fireEvent.pointerDown(scroller, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 240, clientY: 200, pointerId: 1 })
        fireEvent.pointerUp(scroller, { pointerId: 1 })
        fireEvent.click(screen.getByRole('button', { name: 'Orders' }))

        expect(onSelect).not.toHaveBeenCalled()
    })

    it('keeps the pan delta in viewport pixels at every zoom scale', () => {
        const { scroller, service } = renderCurrentViewport()
        act(() => { service.setViewportScale(2) })
        scroller.scrollLeft = 120
        scroller.scrollTop = 80

        fireEvent.pointerDown(scroller, { button: 0, clientX: 300, clientY: 200, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(scroller, { clientX: 260, clientY: 170, pointerId: 1 })
        fireEvent.pointerUp(scroller, { pointerId: 1 })

        expect(scroller.scrollLeft).toBe(160)
        expect(scroller.scrollTop).toBe(110)
        expect(service.getViewportScaleSnapshot()).toBe(2)
    })
})
