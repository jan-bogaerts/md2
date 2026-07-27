import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResizablePopover } from './resizable_popover'

describe('ResizablePopover', () => {
    afterEach(cleanup)

    it('renders an anchored dialog at its initial size', () => {
        render(
            <ResizablePopover
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="popup-title"
                onClose={vi.fn()}
                open
                resizeLabel="Resize test popup"
            >
                <h2 id="popup-title">Test popup</h2>
            </ResizablePopover>,
        )

        expect(screen.getByRole('dialog', { name: 'Test popup' })).toBeInTheDocument()
        const paper = document.querySelector('.MuiPopover-paper') as HTMLElement
        expect(paper.style.width).toBe('400px')
        expect(paper.style.height).toBe('300px')
    })

    it('resizes from the configured lower corner', () => {
        render(
            <ResizablePopover
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="popup-title"
                onClose={vi.fn()}
                open
                resizeCorner="lower-left"
                resizeLabel="Resize test popup"
            >
                <h2 id="popup-title">Test popup</h2>
            </ResizablePopover>,
        )
        const handle = screen.getByRole('separator', { name: 'Resize test popup' })
        const paper = document.querySelector('.MuiPopover-paper') as HTMLElement

        fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, pointerId: 1 })
        fireEvent.pointerMove(window, { clientX: 50, clientY: 150, pointerId: 1 })
        fireEvent.pointerUp(window, { pointerId: 1 })

        expect(handle).toHaveAttribute('data-corner', 'lower-left')
        expect(paper.style.width).toBe('450px')
        expect(paper.style.height).toBe('350px')
    })

    it('hides resize handles when resizing is disabled', () => {
        render(
            <ResizablePopover
                anchorElement={document.body}
                initialSize={{ height: 300, width: 400 }}
                labelId="popup-title"
                onClose={vi.fn()}
                open
                resizable={false}
                resizeFromAllSides
                resizeLabel="Resize test popup"
            >
                <h2 id="popup-title">Test popup</h2>
            </ResizablePopover>,
        )

        expect(screen.queryByRole('separator', { name: /Resize test popup/u })).not.toBeInTheDocument()
    })
})
