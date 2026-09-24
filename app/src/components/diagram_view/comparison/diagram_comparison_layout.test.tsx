import { act, cleanup, render, screen } from '@testing-library/react'
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
    it('renders selected stable comparison without surface controls', () => {
        const layoutService = new DiagramComparisonLayoutService()
        render(
            <DiagramComparisonLayout
                horizontalComparison={<div>Horizontal comparison</div>}
                layoutService={layoutService}
                tabbedComparison={<div>Tabbed comparison</div>}
                verticalComparison={<div>Vertical comparison</div>}
            />,
        )

        expect(screen.queryByRole('group', { name: 'Diagram comparison layout' })).not.toBeInTheDocument()
        expect(screen.getByText('Vertical comparison')).toBeInTheDocument()

        act(() => layoutService.setComparisonMode('horizontal'))

        expect(layoutService.getComparisonModeSnapshot()).toBe('horizontal')
        expect(screen.getByText('Horizontal comparison')).toBeInTheDocument()
        expect(screen.queryByText('Vertical comparison')).not.toBeInTheDocument()

        act(() => layoutService.setComparisonMode('tabbed'))

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
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('keeps selected comparison available in a narrow workspace', () => {
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

        expect(screen.queryByRole('button')).not.toBeInTheDocument()
        expect(screen.getByText('Tabbed comparison')).toBeInTheDocument()
        expect(layoutService.getComparisonModeSnapshot()).toBe('vertical')
    })
})
