import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDiagramSurfacePan, type DiagramSurfacePanOptions } from './use_diagram_surface_pan'

interface PanHarnessProps extends Partial<DiagramSurfacePanOptions> {
    onSurfaceClick?: () => void
}

function PanHarness({
    canStartPan = () => true,
    enabled = true,
    onPanCancel,
    onPanComplete,
    onPanStart,
    onSurfaceClick,
    preventDefaultForTouch,
}: PanHarnessProps) {
    const scrollerRef = useRef<HTMLDivElement>(null)
    const pan = useDiagramSurfacePan(scrollerRef, {
        canStartPan,
        enabled,
        onPanCancel,
        onPanComplete,
        onPanStart,
        preventDefaultForTouch,
    })
    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => { pan.beginPan(event) }
    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => { pan.updatePan(event) }
    const handlePointerUp = () => { pan.completePan() }
    const handlePointerCancel = () => { pan.cancelPan() }
    const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!pan.consumeSuppressedClick()) return

        event.preventDefault()
        event.stopPropagation()
    }

    return (
        <div
            aria-label="Pan surface"
            onClick={onSurfaceClick}
            onClickCapture={handleClickCapture}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            ref={scrollerRef}
        />
    )
}

function panSurface() {
    const surface = screen.getByLabelText('Pan surface')
    surface.scrollLeft = 120
    surface.scrollTop = 80

    return surface
}

afterEach(cleanup)

describe('useDiagramSurfacePan', () => {
    it('drags scroll offsets against the pointer in both axes and restores the cursor on release', () => {
        render(<PanHarness />)
        const surface = panSurface()
        expect(surface).toHaveStyle({ cursor: 'grab' })

        fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 150, isPrimary: true, pointerId: 1 })
        expect(surface).toHaveStyle({ cursor: 'grabbing' })

        fireEvent.pointerMove(surface, { clientX: 170, clientY: 130, pointerId: 1 })

        expect(surface.scrollLeft).toBe(150)
        expect(surface.scrollTop).toBe(100)

        fireEvent.pointerUp(surface, { pointerId: 1 })
        expect(surface).toHaveStyle({ cursor: 'grab' })
    })

    it('reports the same scroll delta whatever the diagram zoom scale renders at', () => {
        render(<PanHarness />)
        const surface = panSurface()

        fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 150, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(surface, { clientX: 160, clientY: 120, pointerId: 1 })
        const scaleOneOffsets = { scrollLeft: surface.scrollLeft, scrollTop: surface.scrollTop }
        fireEvent.pointerUp(surface, { pointerId: 1 })

        surface.style.zoom = '2.5'
        surface.scrollLeft = 120
        surface.scrollTop = 80
        fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 150, isPrimary: true, pointerId: 2 })
        fireEvent.pointerMove(surface, { clientX: 160, clientY: 120, pointerId: 2 })

        expect({ scrollLeft: surface.scrollLeft, scrollTop: surface.scrollTop }).toEqual(scaleOneOffsets)
    })

    it('restores the offsets recorded at pointer down when the pan is cancelled', () => {
        const onPanCancel = vi.fn()
        render(<PanHarness onPanCancel={onPanCancel} />)
        const surface = panSurface()

        fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 150, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(surface, { clientX: 100, clientY: 40, pointerId: 1 })
        fireEvent.pointerCancel(surface, { pointerId: 1 })

        expect(surface.scrollLeft).toBe(120)
        expect(surface.scrollTop).toBe(80)
        expect(onPanCancel).toHaveBeenCalledOnce()
        expect(surface).toHaveStyle({ cursor: 'grab' })
    })

    it('swallows the click after a pan past the drag threshold and keeps a short click alive', () => {
        const onSurfaceClick = vi.fn()
        render(<PanHarness onSurfaceClick={onSurfaceClick} />)
        const surface = panSurface()

        fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 150, isPrimary: true, pointerId: 1 })
        fireEvent.pointerMove(surface, { clientX: 201, clientY: 151, pointerId: 1 })
        fireEvent.pointerUp(surface, { pointerId: 1 })
        fireEvent.click(surface)

        expect(onSurfaceClick).toHaveBeenCalledOnce()

        fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 150, isPrimary: true, pointerId: 2 })
        fireEvent.pointerMove(surface, { clientX: 190, clientY: 150, pointerId: 2 })
        fireEvent.pointerUp(surface, { pointerId: 2 })
        fireEvent.click(surface)

        expect(onSurfaceClick).toHaveBeenCalledOnce()
    })

    it('starts no pan for a refused target, a secondary button, or a non-primary pointer', () => {
        const canStartPan = vi.fn((event: ReactPointerEvent<HTMLElement>) => event.clientX < 500)
        const onPanStart = vi.fn()
        render(<PanHarness canStartPan={canStartPan} onPanStart={onPanStart} />)
        const surface = panSurface()

        fireEvent.pointerDown(surface, { button: 0, clientX: 600, clientY: 150, isPrimary: true, pointerId: 1 })
        fireEvent.pointerDown(surface, { button: 2, clientX: 200, clientY: 150, isPrimary: true, pointerId: 2 })
        fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 150, isPrimary: false, pointerId: 3 })
        fireEvent.pointerMove(surface, { clientX: 100, clientY: 40, pointerId: 1 })

        expect(onPanStart).not.toHaveBeenCalled()
        expect(surface.scrollLeft).toBe(120)
        expect(surface.scrollTop).toBe(80)
    })

    it('leaves touch pointer defaults alone unless the caller asks for them to be suppressed', () => {
        const { rerender } = render(<PanHarness />)
        const surface = panSurface()

        const nativeTouchDown = fireEvent.pointerDown(
            surface, { button: 0, clientX: 200, clientY: 150, isPrimary: true, pointerId: 1, pointerType: 'touch' },
        )
        fireEvent.pointerUp(surface, { pointerId: 1 })

        expect(nativeTouchDown).toBe(true)

        rerender(<PanHarness preventDefaultForTouch />)
        const suppressedTouchDown = fireEvent.pointerDown(
            surface, { button: 0, clientX: 200, clientY: 150, isPrimary: true, pointerId: 2, pointerType: 'touch' },
        )

        expect(suppressedTouchDown).toBe(false)
    })

    it('offers no grab cursor where panning is not available', () => {
        render(<PanHarness enabled={false} />)

        expect(screen.getByLabelText('Pan surface').style.cursor).toBe('')
    })
})
