import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResizablePopper } from './resizable_popper'

function ExpandablePopper() {
    const [fullHeight, setFullHeight] = useState(false)
    const handleToggleFullHeight = () => setFullHeight((current) => !current)

    return (
        <ResizablePopper
            anchorElement={document.body}
            fullHeight={fullHeight}
            initialSize={{ height: 300, width: 400 }}
            labelId="expandable-popper-title"
            onClose={vi.fn()}
            open
            resizeFromAllSides
            resizeLabel="Resize expandable popper"
        >
            <h2 id="expandable-popper-title">Expandable popper</h2>
            <button onClick={handleToggleFullHeight} type="button">
                {fullHeight ? 'Collapse' : 'Expand'}
            </button>
        </ResizablePopper>
    )
}

describe('ResizablePopper', () => {
    afterEach(cleanup)

    it('keeps the surrounding application interactive while open', () => {
        const onBackgroundClick = vi.fn()
        render(
            <>
                <button onClick={onBackgroundClick} type="button">Background action</button>
                <ResizablePopper
                    anchorElement={document.body}
                    initialSize={{ height: 300, width: 400 }}
                    labelId="popper-title"
                    onClose={vi.fn()}
                    open
                    resizeLabel="Resize test popper"
                >
                    <h2 id="popper-title">Test popper</h2>
                </ResizablePopper>
            </>,
        )

        fireEvent.click(screen.getByRole('button', { name: 'Background action' }))

        expect(onBackgroundClick).toHaveBeenCalledOnce()
        expect(screen.getByRole('dialog', { name: 'Test popper' })).toBeInTheDocument()
        expect(document.querySelector('.MuiModal-root')).not.toBeInTheDocument()
    })

    it('uses fixed viewport positioning without extending the application document', () => {
        render(
            <ResizablePopper
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={vi.fn()}
                open
                resizeLabel="Resize test popper"
            >
                <h2 id="popper-title">Test popper</h2>
            </ResizablePopper>,
        )

        expect(document.querySelector('.MuiPopper-root')).toHaveStyle({ position: 'fixed' })
    })

    it('resizes and closes with Escape', () => {
        const onClose = vi.fn()
        render(
            <ResizablePopper
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={onClose}
                open
                resizeLabel="Resize test popper"
            >
                <h2 id="popper-title">Test popper</h2>
            </ResizablePopper>,
        )
        const dialog = screen.getByRole('dialog', { name: 'Test popper' })
        const handle = screen.getByRole('separator', { name: 'Resize test popper' })

        fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 100, clientY: 60, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })
        fireEvent.keyDown(dialog, { key: 'Escape' })

        expect(dialog.style.width).toBe('500px')
        expect(dialog.style.height).toBe('360px')
        expect(onClose).toHaveBeenCalledOnce()
    })

    it('resizes from the top-left without offsetting the anchored paper', () => {
        render(
            <ResizablePopper
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={vi.fn()}
                open
                resizeFromAllSides
                resizeLabel="Resize test popper"
            >
                <h2 id="popper-title">Test popper</h2>
            </ResizablePopper>,
        )
        const dialog = screen.getByRole('dialog', { name: 'Test popper' })
        const handle = screen.getByRole('separator', { name: 'Resize test popper from top-left' })

        expect(screen.getAllByRole('separator', { name: /Resize test popper from/u })).toHaveLength(8)
        fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 50, clientY: 40, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(dialog.style.width).toBe('450px')
        expect(dialog.style.height).toBe('360px')
        expect(dialog.style.left).toBe('')
        expect(dialog.style.top).toBe('')
    })

    it('centers an unanchored draggable popper and moves it from its drag handle', () => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200, writable: true })
        render(
            <ResizablePopper
                anchorElement={null}
                draggable
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={vi.fn()}
                open
                resizeFromAllSides
                resizeLabel="Resize draggable popper"
            >
                <div data-drag-handle="true"><h2 id="popper-title">Draggable popper</h2></div>
            </ResizablePopper>,
        )
        const dialog = screen.getByRole('dialog', { name: 'Draggable popper' })
        const dragHandle = screen.getByRole('heading', { name: 'Draggable popper' })
        dialog.getBoundingClientRect = vi.fn(() => new DOMRect(
            Number.parseFloat(dialog.style.left),
            Number.parseFloat(dialog.style.top),
            Number.parseFloat(dialog.style.width),
            Number.parseFloat(dialog.style.height),
        ))

        expect(dialog).toHaveStyle({ height: '300px', left: '400px', position: 'fixed', top: '250px', width: '400px' })
        fireEvent.pointerDown(dragHandle, { clientX: 450, clientY: 275, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 550, clientY: 325, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(dialog).toHaveStyle({ left: '500px', top: '300px' })

        const resizeHandle = screen.getByRole('separator', { name: 'Resize draggable popper from top-left' })
        fireEvent.pointerDown(resizeHandle, { clientX: 500, clientY: 300, pointerId: 2 })
        fireEvent.pointerMove(window, { clientX: 450, clientY: 250, pointerId: 2 })
        fireEvent.pointerUp(window, { pointerId: 2 })

        expect(dialog).toHaveStyle({ height: '350px', left: '450px', top: '250px', width: '450px' })
    })

    it('restores a saved size when reopened', () => {
        const storageKey = 'test.resizablePopperSize'
        window.localStorage.removeItem(storageKey)
        const firstRender = render(
            <ResizablePopper
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="first-popper-title"
                onClose={vi.fn()}
                open
                resizeLabel="Resize first popper"
                storageKey={storageKey}
            >
                <h2 id="first-popper-title">First popper</h2>
            </ResizablePopper>,
        )
        const handle = screen.getByRole('separator', { name: 'Resize first popper' })

        fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 100, clientY: 60, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })
        firstRender.unmount()

        render(
            <ResizablePopper
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="second-popper-title"
                onClose={vi.fn()}
                open
                resizeLabel="Resize second popper"
                storageKey={storageKey}
            >
                <h2 id="second-popper-title">Second popper</h2>
            </ResizablePopper>,
        )
        const restoredDialog = screen.getByRole('dialog', { name: 'Second popper' })

        expect(restoredDialog.style.width).toBe('500px')
        expect(restoredDialog.style.height).toBe('360px')
    })

    it('keeps full-height presentation constrained without overwriting normal size', () => {
        const storageKey = 'test.fullHeightResizablePopperSize'
        window.localStorage.removeItem(storageKey)
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200, writable: true })
        const view = render(
            <ResizablePopper
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={vi.fn()}
                open
                resizeFromAllSides
                resizeLabel="Resize test popper"
                storageKey={storageKey}
            >
                <h2 id="popper-title">Test popper</h2>
            </ResizablePopper>,
        )
        const dialog = screen.getByRole('dialog', { name: 'Test popper' })
        dialog.getBoundingClientRect = vi.fn(() => new DOMRect(900, 100, 400, 300))

        view.rerender(
            <ResizablePopper
                anchorElement={document.body}
                fullHeight
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={vi.fn()}
                open
                resizeFromAllSides
                resizeLabel="Resize test popper"
                storageKey={storageKey}
            >
                <h2 id="popper-title">Test popper</h2>
            </ResizablePopper>,
        )

        expect(dialog.style.height).toBe('100vh')
        expect(dialog.style.left).toBe('800px')
        expect(screen.queryByRole('separator', { name: /Resize test popper/u })).not.toBeInTheDocument()
        expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')).toEqual({ height: 300, width: 400 })

        window.innerWidth = 600
        fireEvent(window, new Event('resize'))

        expect(dialog.style.left).toBe('200px')
    })

    it('keeps its anchored horizontal position and can collapse after expanding', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200, writable: true })
        render(<ExpandablePopper />)
        const dialog = screen.getByRole('dialog', { name: 'Expandable popper' })
        dialog.getBoundingClientRect = vi.fn(() => {
            const left = dialog.style.position === 'fixed' ? Number.parseFloat(dialog.style.left) : 700
            return new DOMRect(left, 100, 400, 300)
        })

        fireEvent.click(screen.getByRole('button', { name: 'Expand' }))

        expect(dialog.style.left).toBe('700px')
        fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))

        expect(dialog).not.toHaveAttribute('data-full-height')
        expect(dialog.style.left).toBe('')
        expect(dialog.style.height).toBe('300px')
        expect(screen.getAllByRole('separator', { name: /Resize expandable popper from/u })).toHaveLength(8)
    })
})
