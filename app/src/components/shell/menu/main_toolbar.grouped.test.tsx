import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { MainToolbar } from './main_toolbar'

const DRAG = 'drag'
const NO_DRAG = 'no-drag'

function appRegion(element: HTMLElement) {
    return (element.style as unknown as Record<string, string>).WebkitAppRegion
}

function renderToolbar(isMobile = false, onOpenMenu = vi.fn(), isCompact = isMobile) {
    return render(
        <AppThemeProvider>
            <MainToolbar
                availableTabs={[{ label: 'Home', value: 'home' }]}
                currentTab="home"
                isCompact={isCompact}
                isMobile={isMobile}
                isNewActionDisabled={false}
                isNewCardDisabled={false}
                isNewDiagramDisabled={false}
                onCreateAction={vi.fn()}
                onCreateCard={vi.fn()}
                onCreateDiagram={vi.fn()}
                onOpenMenu={onOpenMenu}
                onTabChange={vi.fn()}
            />
        </AppThemeProvider>,
    )
}

describe('MainToolbar', () => {
    afterEach(cleanup)

    it('hides the hamburger button on desktop', () => {
        renderToolbar()

        expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    })

    it('renders the application icon', () => {
        renderToolbar()

        expect(screen.getByRole('img', { name: 'MD² application icon' })).toHaveAttribute('src', '/favicon.svg')
    })

    it('opens the menu from the hamburger button on mobile', () => {
        const onOpenMenu = vi.fn()
        renderToolbar(true, onOpenMenu)

        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))

        expect(onOpenMenu).toHaveBeenCalledTimes(1)
    })

    it('hides the project name on mobile', () => {
        renderToolbar(true)

        expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
        expect(screen.getByTestId('project-name-region')).not.toBeVisible()
        expect(screen.queryByTestId('project-name-label')).toBeNull()
    })

    it('renders the mobile action immediately before search', () => {
        renderToolbar(true)

        const createButton = screen.getByRole('button', { name: 'Create' })
        const searchButton = screen.getByRole('button', { name: 'Search' })
        expect(createButton.parentElement?.nextElementSibling).toContainElement(searchButton)
    })

    it('renders tabs before search', () => {
        renderToolbar()

        expect(screen.getByRole('tab', { name: 'Home' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Search project' })).toBeInTheDocument()
        const homeTab = screen.getByRole('tab', { name: 'Home' })
        const searchInput = screen.getByRole('textbox', { name: 'Search project' })
        expect(homeTab.compareDocumentPosition(searchInput) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    })

    it('centers the project name region between the tabs and theme control', () => {
        renderToolbar()

        const navigationRegion = screen.getByTestId('toolbar-navigation')
        const projectNameRegion = screen.getByTestId('project-name-region')
        const themeRegion = screen.getByRole('button', { name: /Switch to (dark|light) theme/u }).parentElement?.parentElement as HTMLElement

        expect(navigationRegion.nextElementSibling).toBe(projectNameRegion)
        expect(projectNameRegion.nextElementSibling).toBe(themeRegion)
        expect(projectNameRegion).toHaveStyle({ justifyContent: 'center' })
    })

    it('makes the bar draggable while keeping the search controls non-draggable', () => {
        const { container } = renderToolbar()

        const bar = container.querySelector('.MuiToolbar-root') as HTMLElement
        const applicationIcon = screen.getByRole('img', { name: /application icon/u })
        const searchRegion = screen.getByRole('textbox', { name: 'Search project' }).closest('[data-search-presentation]') as HTMLElement

        expect(appRegion(bar)).toBe(DRAG)
        expect(appRegion(applicationIcon.parentElement as HTMLElement)).not.toBe(NO_DRAG)
        expect(appRegion(searchRegion)).toBe(NO_DRAG)
    })
})
