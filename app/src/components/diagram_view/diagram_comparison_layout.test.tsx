import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiagramComparisonLayout } from './diagram_comparison_layout'
import { DiagramComparisonLayoutService } from './diagram_comparison_layout_service'

function setMobileBreakpoint(matches: boolean) {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn().mockImplementation(() => ({
            addEventListener: vi.fn(),
            matches,
            media: '(max-width:899.95px)',
            removeEventListener: vi.fn(),
        })),
    })
}

beforeEach(() => setMobileBreakpoint(false))

afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
})

describe('DiagramComparisonLayout', () => {
    it('offers all modes and renders selected stable comparison', async () => {
        const layoutService = new DiagramComparisonLayoutService()
        const user = userEvent.setup()
        render(
            <DiagramComparisonLayout
                horizontalComparison={<div>Horizontal comparison</div>}
                layoutService={layoutService}
                tabbedComparison={<div>Tabbed comparison</div>}
                verticalComparison={<div>Vertical comparison</div>}
            />,
        )

        expect(screen.getByRole('group', { name: 'Diagram comparison layout' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Vertical' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByText('Vertical comparison')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Horizontal' }))

        expect(layoutService.getComparisonModeSnapshot()).toBe('horizontal')
        expect(screen.getByText('Horizontal comparison')).toBeInTheDocument()
        expect(screen.queryByText('Vertical comparison')).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Tabbed' }))

        expect(layoutService.getComparisonModeSnapshot()).toBe('tabbed')
        expect(screen.getByText('Tabbed comparison')).toBeInTheDocument()
    })

    it('ignores unrelated layout events', () => {
        const layoutService = new DiagramComparisonLayoutService()
        const verticalComparison = vi.fn(() => <div>Vertical comparison</div>)
        const VerticalComparison = verticalComparison
        render(
            <DiagramComparisonLayout
                horizontalComparison={<div>Horizontal comparison</div>}
                layoutService={layoutService}
                tabbedComparison={<div>Tabbed comparison</div>}
                verticalComparison={<VerticalComparison />}
            />,
        )

        layoutService.setActiveTab('new')
        layoutService.setHorizontalDividerRatio(0.75)
        layoutService.setVerticalDividerRatio(0.25)

        expect(verticalComparison).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('button', { name: 'Vertical' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('keeps all labelled controls available in a narrow workspace', () => {
        render(
            <div style={{ width: 320 }}>
                <DiagramComparisonLayout
                    horizontalComparison={<div>Horizontal comparison</div>}
                    layoutService={new DiagramComparisonLayoutService()}
                    tabbedComparison={<div>Tabbed comparison</div>}
                    verticalComparison={<div>Vertical comparison</div>}
                />
            </div>,
        )

        expect(screen.getByRole('button', { name: 'Vertical' })).toBeVisible()
        expect(screen.getByRole('button', { name: 'Horizontal' })).toBeVisible()
        expect(screen.getByRole('button', { name: 'Tabbed' })).toBeVisible()
        expect(screen.getByLabelText('Selected diagram comparison')).toBeInTheDocument()
    })

    it('uses tabbed comparison on mobile while retaining desktop choice', () => {
        setMobileBreakpoint(true)
        const layoutService = new DiagramComparisonLayoutService()
        render(
            <DiagramComparisonLayout
                horizontalComparison={<div>Horizontal comparison</div>}
                layoutService={layoutService}
                tabbedComparison={<div>Tabbed comparison</div>}
                verticalComparison={<div>Vertical comparison</div>}
            />,
        )

        expect(screen.getByRole('button', { name: 'Vertical' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Horizontal' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Tabbed' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByText('Tabbed comparison')).toBeInTheDocument()
        expect(layoutService.getComparisonModeSnapshot()).toBe('vertical')
    })
})
