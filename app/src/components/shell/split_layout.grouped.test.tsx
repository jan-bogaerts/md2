import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { SPLIT_WIDTH_STORAGE_KEY, SplitLayout } from './split_layout'

const CONTAINER_WIDTH = 1000

describe('SplitLayout', () => {
    beforeEach(() => {
        workspaceViewService.setViewMode('text')
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({bottom: 0, height: 0, left: 0, right: CONTAINER_WIDTH, toJSON: () => ({}), top: 0, width: CONTAINER_WIDTH, x: 0, y: 0})
    })

    afterEach(() => {
        cleanup()
        workspaceViewService.setViewMode('cards')
        window.localStorage.clear()
        vi.restoreAllMocks()
    })

    it('renders both panels', () => {
        render(<SplitLayout left={<div>Left panel</div>} right={<div>Right panel</div>} />)

        expect(screen.getByText('Left panel')).toBeInTheDocument()
        expect(screen.getByText('Right panel')).toBeInTheDocument()
    })

    it('changes visibility directly without remounting its panels', () => {
        render(<SplitLayout left={<div>Left panel</div>} right={<div>Right panel</div>} />)
        const leftPanel = screen.getByText('Left panel')
        const splitLayout = leftPanel.parentElement?.parentElement

        act(() => workspaceViewService.setViewMode('cards'))

        expect(screen.getByText('Left panel')).toBe(leftPanel)
        expect(splitLayout).toHaveStyle({ display: 'none' })

        act(() => workspaceViewService.setViewMode('text'))

        expect(screen.getByText('Left panel')).toBe(leftPanel)
        expect(splitLayout).toHaveStyle({ display: 'flex' })
    })

    it('hides the left panel without remounting the right panel', () => {
        const { rerender } = render(<SplitLayout left={<div>Left panel</div>} right={<div>Right panel</div>} />)
        const rightPanel = screen.getByText('Right panel')

        rerender(<SplitLayout left={null} right={<div>Right panel</div>} />)

        expect(screen.queryByText('Left panel')).toBeNull()
        expect(screen.queryByRole('separator')).toBeNull()
        expect(screen.getByText('Right panel')).toBe(rightPanel)
    })

    it('persists the width after dragging the separator', () => {
        render(<SplitLayout left={<div>Left</div>} right={<div>Right</div>} />)
        const separator = screen.getByRole('separator')

        fireEvent.pointerDown(separator, { pointerId: 1 })
        fireEvent.pointerMove(separator, { clientX: 420, pointerId: 1 })
        fireEvent.pointerUp(separator, { pointerId: 1 })

        expect(window.localStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)).toBe('420')
    })

    it('clamps the width to the minimum', () => {
        render(<SplitLayout left={<div>Left</div>} right={<div>Right</div>} />)
        const separator = screen.getByRole('separator')

        fireEvent.pointerDown(separator, { pointerId: 1 })
        fireEvent.pointerMove(separator, { clientX: 10, pointerId: 1 })
        fireEvent.pointerUp(separator, { pointerId: 1 })

        expect(window.localStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)).toBe('160')
    })

    it('resizes with keyboard arrows', () => {
        render(<SplitLayout left={<div>Left</div>} right={<div>Right</div>} />)
        const separator = screen.getByRole('separator')

        fireEvent.keyDown(separator, { key: 'ArrowRight' })

        expect(window.localStorage.getItem(SPLIT_WIDTH_STORAGE_KEY)).toBe('304')
        expect(separator).toHaveAttribute('aria-valuenow', '304')
    })
})
