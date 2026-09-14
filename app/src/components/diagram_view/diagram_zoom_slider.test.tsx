import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
    DEFAULT_DIAGRAM_ZOOM,
    DIAGRAM_ZOOM_STEP,
    MAXIMUM_DIAGRAM_ZOOM,
    MINIMUM_DIAGRAM_ZOOM,
} from '../../services/diagrams/diagram_zoom'
import { DiagramZoomSlider, type DiagramZoomStore } from './diagram_zoom_slider'

class ZoomStoreStub extends EventTarget implements DiagramZoomStore {
    private scale = DEFAULT_DIAGRAM_ZOOM

    getViewportScaleSnapshot = () => this.scale

    setViewportScale = (scale: number) => {
        if (scale === this.scale) return false

        this.scale = scale
        this.dispatchEvent(new Event('changed'))

        return true
    }

    subscribeViewportScale = (listener: () => void) => {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }
}

describe('DiagramZoomSlider', () => {
    it('sets direct values and exposes identity, bounds, and percentage text', () => {
        const store = new ZoomStoreStub()
        render(<DiagramZoomSlider diagramIdentity="Current" store={store} />)
        const slider = screen.getByRole('slider', { name: 'Current diagram zoom' })

        expect(slider).toHaveAttribute('aria-valuemin', String(MINIMUM_DIAGRAM_ZOOM))
        expect(slider).toHaveAttribute('aria-valuemax', String(MAXIMUM_DIAGRAM_ZOOM))
        expect(slider).toHaveAttribute('aria-valuenow', String(DEFAULT_DIAGRAM_ZOOM))
        expect(slider).toHaveAttribute('aria-valuetext', '100%')

        const updatedScale = DEFAULT_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP
        fireEvent.change(slider, { target: { value: String(updatedScale) } })

        expect(store.getViewportScaleSnapshot()).toBe(updatedScale)
        expect(slider).toHaveAttribute('aria-valuetext', `${updatedScale * 100}%`)
    })

    it('uses configured steps for keyboard input and respects both bounds', async () => {
        const store = new ZoomStoreStub()
        const user = userEvent.setup()
        render(<DiagramZoomSlider diagramIdentity="New" store={store} />)
        const slider = screen.getByRole('slider', { name: 'New diagram zoom' })

        slider.focus()
        await user.keyboard('{ArrowRight}')
        expect(store.getViewportScaleSnapshot()).toBe(DEFAULT_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP)

        fireEvent.change(slider, { target: { value: String(MINIMUM_DIAGRAM_ZOOM) } })
        await user.keyboard('{ArrowLeft}')
        expect(store.getViewportScaleSnapshot()).toBe(MINIMUM_DIAGRAM_ZOOM)

        await user.keyboard('{ArrowRight}')
        expect(store.getViewportScaleSnapshot()).toBe(MINIMUM_DIAGRAM_ZOOM + DIAGRAM_ZOOM_STEP)

        fireEvent.change(slider, { target: { value: String(MAXIMUM_DIAGRAM_ZOOM) } })
        await user.keyboard('{ArrowRight}')
        expect(store.getViewportScaleSnapshot()).toBe(MAXIMUM_DIAGRAM_ZOOM)
    })
})
