import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { MobileLayout } from './mobile_layout'

describe('MobileLayout', () => {
    beforeEach(() => {
        workspaceViewService.setViewMode('text')
    })

    afterEach(() => {
        cleanup()
        workspaceViewService.setViewMode('cards')
    })

    it('renders its content', () => {
        render(<MobileLayout content={<div>Text view</div>} />)

        expect(screen.getByText('Text view')).toBeInTheDocument()
    })

    it('is hidden while the card view mode is active', () => {
        workspaceViewService.setViewMode('cards')
        render(<MobileLayout content={<div>Text view</div>} />)

        expect(screen.getByText('Text view').parentElement?.parentElement).toHaveStyle({ display: 'none' })
    })

    it('changes visibility directly without remounting its content', () => {
        render(<MobileLayout content={<div>Text view</div>} />)
        const content = screen.getByText('Text view')
        const container = content.parentElement?.parentElement

        act(() => workspaceViewService.setViewMode('cards'))

        expect(screen.getByText('Text view')).toBe(content)
        expect(container).toHaveStyle({ display: 'none' })

        act(() => workspaceViewService.setViewMode('text'))

        expect(screen.getByText('Text view')).toBe(content)
        expect(container).toHaveStyle({ display: 'flex' })
    })
})
