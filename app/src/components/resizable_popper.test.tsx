import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResizablePopper } from './resizable_popper'

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
})
