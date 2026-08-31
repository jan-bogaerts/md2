import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { MainToolbar } from './main_toolbar'

const search = <input aria-label="Search project" />
const tabs = <button type="button">Home</button>
const panel = <div>Project section</div>
const mobileAction = <button type="button">Create</button>

const DRAG = 'drag'
const NO_DRAG = 'no-drag'

function appRegion(element: HTMLElement) {
    return (element.style as unknown as Record<string, string>).WebkitAppRegion
}

function renderToolbar(isMobile = false, onOpenMenu = vi.fn()) {
    return render(
        <AppThemeProvider>
            <MainToolbar
                isMobile={isMobile}
                mobileAction={mobileAction}
                onOpenMenu={onOpenMenu}
                panel={panel}
                search={search}
                tabs={tabs}
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

    it('renders the mobile action immediately before search', () => {
        renderToolbar(true)

        const createButton = screen.getByRole('button', { name: 'Create' })
        const searchInput = screen.getByRole('textbox', { name: 'Search project' })
        expect(createButton.parentElement?.nextElementSibling).toContainElement(searchInput)
    })

    it('renders tabs before search and panel below the row', () => {
        const { container } = renderToolbar()

        expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Search project' })).toBeInTheDocument()
        expect(screen.getByText('Project section')).toBeInTheDocument()
        expect(container.textContent?.indexOf('Home')).toBeLessThan(container.textContent?.indexOf('Project section') ?? 0)
    })

    it('centers the project name region between the tabs and theme control', () => {
        renderToolbar()

        const tabsRegion = screen.getByRole('button', { name: 'Home' }).parentElement as HTMLElement
        const projectNameRegion = screen.getByTestId('project-name-region')
        const themeRegion = screen.getByRole('button', { name: /Switch to (dark|light) theme/u }).parentElement as HTMLElement

        expect(tabsRegion.nextElementSibling).toBe(projectNameRegion)
        expect(projectNameRegion.nextElementSibling).toBe(themeRegion)
        expect(projectNameRegion).toHaveStyle({ justifyContent: 'center' })
    })

    it('makes the bar draggable while keeping the search controls non-draggable', () => {
        const { container } = renderToolbar()

        const bar = container.querySelector('.MuiToolbar-root') as HTMLElement
        const applicationIcon = screen.getByRole('img', { name: /application icon/u })
        const searchRegion = screen.getByRole('textbox', { name: 'Search project' }).parentElement as HTMLElement

        expect(appRegion(bar)).toBe(DRAG)
        expect(appRegion(applicationIcon.parentElement as HTMLElement)).not.toBe(NO_DRAG)
        expect(appRegion(searchRegion)).toBe(NO_DRAG)
    })
})
