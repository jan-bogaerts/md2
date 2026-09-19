import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cardPopupService } from '../../../../services/card_popup_service'
import { workspaceViewService } from '../../../../services/project/workspace_view_service'
import { AppThemeProvider } from '../../../../theme/theme_provider'
import { CardActionPopupHost } from './card_action_popup_host'

const hostEntry = vi.hoisted(() => vi.fn<(props: Record<string, unknown>) => null>(() => null))

vi.mock('./card_action_popup_host_entry', () => ({ CardActionPopupHostEntry: hostEntry }))

const originalMatchMedia = window.matchMedia

function setMobileBreakpoint(matches: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: matches && query.includes('max-width'),
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia
}

function renderedProps(entryId: string) {
    return hostEntry.mock.calls
        .map(([props]) => props)
        .filter((props) => (props.entry as { id: string }).id === entryId)
        .at(-1)
}

describe('CardActionPopupHost', () => {
    beforeEach(() => {
        setMobileBreakpoint(false)
        workspaceViewService.setViewMode('cards')
    })

    afterEach(() => {
        cleanup()
        cardPopupService.clear()
        workspaceViewService.setViewMode('cards')
        window.matchMedia = originalMatchMedia
        hostEntry.mockClear()
    })

    it('renders a project entry with its stack position', () => {
        cardPopupService.toggleAction({ kind: 'card', cardInternalId: 'card-1' }, document.createElement('button'))
        cardPopupService.toggleAction({ kind: 'project' }, document.createElement('button'))
        const projectEntryId = cardPopupService.getSnapshot()[1].id

        render(<CardActionPopupHost />, { wrapper: AppThemeProvider })

        expect(renderedProps(projectEntryId)).toMatchObject({ stackPosition: 1, visible: true })
    })

    it('keeps the project popup visible in stats view while hiding card popups', () => {
        cardPopupService.toggleAction({ kind: 'card', cardInternalId: 'card-1' }, document.createElement('button'))
        cardPopupService.toggleAction({ kind: 'project' }, document.createElement('button'))
        const [cardEntry, projectEntry] = cardPopupService.getSnapshot()
        workspaceViewService.setViewMode('stats')

        render(<CardActionPopupHost />, { wrapper: AppThemeProvider })

        expect(renderedProps(projectEntry.id)).toMatchObject({ visible: true })
        expect(renderedProps(cardEntry.id)).toMatchObject({ visible: false })
    })

    it('hides the project popup in diagram view', () => {
        cardPopupService.toggleAction({ kind: 'project' }, document.createElement('button'))
        const projectEntryId = cardPopupService.getSnapshot()[0].id
        workspaceViewService.setViewMode('diagrams')

        render(<CardActionPopupHost />, { wrapper: AppThemeProvider })

        expect(renderedProps(projectEntryId)).toMatchObject({ visible: false })
    })

    it('opens only the topmost entry on mobile', () => {
        setMobileBreakpoint(true)
        cardPopupService.toggleAction({ kind: 'project' }, document.createElement('button'))
        cardPopupService.toggleAction({ kind: 'card', cardInternalId: 'card-1' }, document.createElement('button'))
        const [projectEntry, cardEntry] = cardPopupService.getSnapshot()

        render(<CardActionPopupHost />, { wrapper: AppThemeProvider })

        expect(renderedProps(projectEntry.id)).toMatchObject({ visible: false })
        expect(renderedProps(cardEntry.id)).toMatchObject({ visible: true })
    })
})
