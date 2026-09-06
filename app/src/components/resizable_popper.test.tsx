import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResizablePopper } from './resizable_popper'

function ExpandablePopper({ storageKey }: { storageKey?: string }) {
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
            resizeHorizontallyWhenFullHeight
            resizeLabel="Resize expandable popper"
            storageKey={storageKey}
        >
            <h2 id="expandable-popper-title">Expandable popper</h2>
            <button onClick={handleToggleFullHeight} type="button">
                {fullHeight ? 'Collapse' : 'Expand'}
            </button>
        </ResizablePopper>
    )
}

describe('ResizablePopper', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

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
        expect(document.querySelector('.MuiPopper-root')).toHaveStyle({ zIndex: '1300' })
    })

    it('uses hosted stack position and activates from pointer and focus capture', () => {
        const onActivate = vi.fn()
        render(
            <ResizablePopper
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onActivate={onActivate}
                onClose={vi.fn()}
                open
                resizeLabel="Resize test popper"
                stackPosition={3}
            >
                <h2 id="popper-title">Test popper</h2>
                <button type="button">Focusable control</button>
            </ResizablePopper>,
        )
        const dialog = screen.getByRole('dialog', { name: 'Test popper' })

        expect(document.querySelector('.MuiPopper-root')).toHaveStyle({ zIndex: '1303' })
        expect(dialog).toHaveFocus()
        expect(onActivate).toHaveBeenCalledOnce()
        onActivate.mockClear()

        fireEvent.pointerDown(dialog)
        fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize test popper' }))
        fireEvent.focus(screen.getByRole('button', { name: 'Focusable control' }))

        expect(onActivate).toHaveBeenCalledTimes(3)
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

    it('uses the configured bottom inset in anchored maximum height', () => {
        const view = render(
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
        const dialog = screen.getByRole('dialog', { name: 'Test popper' })

        expect(dialog).toHaveStyle({ maxHeight: 'calc(100vh - 32px)' })

        view.rerender(
            <ResizablePopper
                anchorElement={document.body}
                bottomInset={0}
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={vi.fn()}
                open
                resizeLabel="Resize test popper"
            >
                <h2 id="popper-title">Test popper</h2>
            </ResizablePopper>,
        )

        expect(dialog).toHaveStyle({ maxHeight: 'calc(100vh - 16px)' })
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

    it('opens an anchored draggable popper in place and detaches it from its drag handle', () => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200, writable: true })
        render(
            <ResizablePopper
                anchorElement={document.body}
                draggable
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={vi.fn()}
                open
                resizeFromAllSides
                resizeLabel="Resize anchored popper"
            >
                <div data-drag-handle="true"><h2 id="popper-title">Anchored popper</h2></div>
            </ResizablePopper>,
        )
        const dialog = screen.getByRole('dialog', { name: 'Anchored popper' })
        const dragHandle = screen.getByRole('heading', { name: 'Anchored popper' })

        expect(dialog).not.toHaveStyle({ position: 'fixed' })
        expect(dialog.style.left).toBe('')

        dialog.getBoundingClientRect = vi.fn(() => new DOMRect(120, 80, 400, 300))
        fireEvent.pointerDown(dragHandle, { clientX: 150, clientY: 100, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 200, clientY: 140, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(dialog).toHaveStyle({ left: '170px', position: 'fixed', top: '120px' })
    })

    it('leaves clicks on controls inside the drag handle to the control', () => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800, writable: true })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200, writable: true })
        render(
            <ResizablePopper
                anchorElement={document.body}
                draggable
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={vi.fn()}
                open
                resizeFromAllSides
                resizeLabel="Resize control popper"
            >
                <div data-drag-handle="true">
                    <h2 id="popper-title">Control popper</h2>
                    <div aria-label="Conversation history" role="combobox" tabIndex={0} />
                </div>
            </ResizablePopper>,
        )
        const dialog = screen.getByRole('dialog', { name: 'Control popper' })
        dialog.getBoundingClientRect = vi.fn(() => new DOMRect(120, 80, 400, 300))

        const pointerDown = fireEvent.pointerDown(
            screen.getByRole('combobox', { name: 'Conversation history' }),
            { clientX: 150, clientY: 100, pointerId: 1 },
        )
        fireEvent.pointerMove(window, { clientX: 200, clientY: 140, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(pointerDown).toBe(true)
        expect(dialog.style.left).toBe('')
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

    it.each([
        ['malformed', '{'],
        ['incomplete', JSON.stringify({ width: 500 })],
        ['non-finite', '{"height":1e309,"width":500}'],
    ])('uses initial size for %s stored data', (_caseName, storedValue) => {
        const storageKey = `test.invalidResizablePopperSize.${_caseName}`
        window.localStorage.setItem(storageKey, storedValue)

        render(
            <ResizablePopper
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={vi.fn()}
                open
                resizeLabel="Resize test popper"
                storageKey={storageKey}
            >
                <h2 id="popper-title">Test popper</h2>
            </ResizablePopper>,
        )

        expect(screen.getByRole('dialog', { name: 'Test popper' })).toHaveStyle({ height: '300px', width: '400px' })
    })

    it('clamps stored size to configured minimum and viewport limits when enabled', () => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600, writable: true })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800, writable: true })
        const minimumStorageKey = 'test.minimumClampedResizablePopperSize'
        window.localStorage.setItem(minimumStorageKey, JSON.stringify({ height: 20, width: 40 }))
        const firstRender = render(
            <ResizablePopper
                anchorElement={document.body}
                constrainSizeToViewport
                initialSize={{ height: 300, width: 400 }}
                labelId="minimum-popper-title"
                minimumSize={{ height: 52, width: 280 }}
                onClose={vi.fn()}
                open
                resizeLabel="Resize minimum popper"
                storageKey={minimumStorageKey}
            >
                <h2 id="minimum-popper-title">Minimum popper</h2>
            </ResizablePopper>,
        )

        expect(screen.getByRole('dialog', { name: 'Minimum popper' })).toHaveStyle({ height: '52px', width: '280px' })
        firstRender.unmount()

        const viewportStorageKey = 'test.viewportClampedResizablePopperSize'
        window.localStorage.setItem(viewportStorageKey, JSON.stringify({ height: 900, width: 1200 }))
        render(
            <ResizablePopper
                anchorElement={document.body}
                constrainSizeToViewport
                initialSize={{ height: 300, width: 400 }}
                labelId="viewport-popper-title"
                minimumSize={{ height: 52, width: 280 }}
                onClose={vi.fn()}
                open
                resizeLabel="Resize viewport popper"
                storageKey={viewportStorageKey}
            >
                <h2 id="viewport-popper-title">Viewport popper</h2>
            </ResizablePopper>,
        )

        expect(screen.getByRole('dialog', { name: 'Viewport popper' })).toHaveStyle({ height: '568px', width: '768px' })
    })

    it('uses the bottom inset when clamping a constrained resize', () => {
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600, writable: true })
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800, writable: true })
        render(
            <ResizablePopper
                anchorElement={document.body}
                bottomInset={0}
                constrainSizeToViewport
                initialSize={{ height: 300, width: 400 }}
                labelId="popper-title"
                onClose={vi.fn()}
                open
                resizeLabel="Resize test popper"
            >
                <h2 id="popper-title">Test popper</h2>
            </ResizablePopper>,
        )
        const dialog = screen.getByRole('dialog', { name: 'Test popper' })
        const handle = screen.getByRole('separator', { name: 'Resize test popper' })

        fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 1000, clientY: 1000, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(dialog).toHaveStyle({ height: '584px', width: '768px' })
    })

    it('clamps size to an element boundary and responds when that boundary shrinks', () => {
        let boundaryHeight = 300
        let boundaryWidth = 500
        let notifyBoundaryResize: () => void = vi.fn()
        const boundaryElement = document.createElement('div')
        vi.spyOn(boundaryElement, 'getBoundingClientRect').mockImplementation(() => ({
            bottom: boundaryHeight,
            height: boundaryHeight,
            left: 0,
            right: boundaryWidth,
            toJSON: () => ({}),
            top: 0,
            width: boundaryWidth,
            x: 0,
            y: 0,
        }))
        class ResizeObserverStub {
            constructor(callback: ResizeObserverCallback) {
                notifyBoundaryResize = () => callback([], this)
            }

            disconnect = vi.fn()

            observe = vi.fn()

            unobserve = vi.fn()
        }
        vi.stubGlobal('ResizeObserver', ResizeObserverStub)
        render(
            <ResizablePopper
                anchorElement={boundaryElement}
                boundaryElement={boundaryElement}
                initialSize={{ height: 500, width: 700 }}
                labelId="bounded-popper-title"
                onClose={vi.fn()}
                open
                resizeLabel="Resize bounded popper"
            >
                <h2 id="bounded-popper-title">Bounded popper</h2>
            </ResizablePopper>,
        )
        const dialog = screen.getByRole('dialog', { name: 'Bounded popper' })

        expect(dialog).toHaveStyle({ height: '268px', width: '468px' })

        boundaryHeight = 240
        boundaryWidth = 360
        act(notifyBoundaryResize)

        expect(dialog).toHaveStyle({ height: '208px', width: '328px' })
    })

    it('can preserve editor focus and leave Escape handling to its owner', () => {
        render(
            <>
                <input aria-label="Editor" autoFocus />
                <ResizablePopper
                    anchorElement={document.body}
                    closeOnEscape={false}
                    focusOnMount={false}
                    initialSize={{ height: 300, width: 400 }}
                    labelId="popper-title"
                    open
                    resizeLabel="Resize test popper"
                    stackPosition={2}
                >
                    <h2 id="popper-title">Test popper</h2>
                </ResizablePopper>
            </>,
        )
        const editor = screen.getByRole('textbox', { name: 'Editor' })
        const dialog = screen.getByRole('dialog', { name: 'Test popper' })

        fireEvent.keyDown(dialog, { key: 'Escape' })

        expect(editor).toHaveFocus()
        expect(dialog).toBeInTheDocument()
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

    it('resizes both full-height edges, persists width, and restores normal height on collapse', () => {
        const storageKey = 'test.expandableFullHeightWidth'
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000, writable: true })
        render(<ExpandablePopper storageKey={storageKey} />)
        const dialog = screen.getByRole('dialog', { name: 'Expandable popper' })
        dialog.getBoundingClientRect = vi.fn(() => {
            const fullHeight = dialog.getAttribute('data-full-height') === 'true'
            const left = fullHeight ? Number.parseFloat(dialog.style.left) : 300
            const width = Number.parseFloat(dialog.style.width)
            return new DOMRect(left, 0, width, fullHeight ? window.innerHeight : 300)
        })

        fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
        const rightHandle = screen.getByRole('separator', { name: 'Resize expandable popper from right' })
        fireEvent.pointerDown(rightHandle, { clientX: 700, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 850, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(dialog.style.left).toBe('300px')
        expect(dialog.style.width).toBe('550px')

        const leftHandle = screen.getByRole('separator', { name: 'Resize expandable popper from left' })
        fireEvent.pointerDown(leftHandle, { clientX: 300, pointerId: 2 })
        fireEvent.pointerMove(window, { clientX: 500, pointerId: 2 })
        fireEvent.pointerUp(window, { pointerId: 2 })

        expect(dialog.style.height).toBe('100vh')
        expect(dialog.style.left).toBe('500px')
        expect(dialog.style.width).toBe('350px')
        expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')).toEqual({ height: 300, width: 350 })

        fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))

        expect(dialog.style.height).toBe('300px')
        expect(dialog.style.width).toBe('350px')
        expect(screen.getAllByRole('separator', { name: /Resize expandable popper from/u })).toHaveLength(8)
    })

    it('clamps full-height horizontal resizing to minimum width and viewport edges', () => {
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600, writable: true })
        render(<ExpandablePopper />)
        const dialog = screen.getByRole('dialog', { name: 'Expandable popper' })
        dialog.getBoundingClientRect = vi.fn(() => {
            const left = dialog.getAttribute('data-full-height') === 'true' ? Number.parseFloat(dialog.style.left) : 100
            return new DOMRect(left, 0, Number.parseFloat(dialog.style.width), 300)
        })

        fireEvent.click(screen.getByRole('button', { name: 'Expand' }))
        const rightHandle = screen.getByRole('separator', { name: 'Resize expandable popper from right' })
        fireEvent.pointerDown(rightHandle, { clientX: 500, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 0, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })
        expect(dialog).toHaveStyle({ left: '100px', width: '280px' })

        fireEvent.pointerDown(rightHandle, { clientX: 380, pointerId: 2 })
        fireEvent.pointerMove(window, { clientX: 900, pointerId: 2 })
        fireEvent.pointerUp(window, { pointerId: 2 })
        expect(dialog).toHaveStyle({ left: '100px', width: '500px' })

        const leftHandle = screen.getByRole('separator', { name: 'Resize expandable popper from left' })
        fireEvent.pointerDown(leftHandle, { clientX: 100, pointerId: 3 })
        fireEvent.pointerMove(window, { clientX: 500, pointerId: 3 })
        fireEvent.pointerUp(window, { pointerId: 3 })
        expect(dialog).toHaveStyle({ left: '320px', width: '280px' })

        fireEvent.pointerDown(leftHandle, { clientX: 320, pointerId: 4 })
        fireEvent.pointerMove(window, { clientX: -500, pointerId: 4 })
        fireEvent.pointerUp(window, { pointerId: 4 })
        expect(dialog).toHaveStyle({ left: '0px', width: '600px' })
    })
})
