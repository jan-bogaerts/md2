import { act, cleanup, render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import type { ProjectReference } from '../../data/data_types'
import { dataService } from '../../services/data/data_service'
import { workspaceViewService } from '../../services/project/workspace_view_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MobileMainWindow } from './mobile_main_window'

const auth: UseGithubAuthResult = {
    accessToken: null,
    errorMessage: null,
    isAuthenticated: false,
    isLoadingUser: false,
    logout: vi.fn(),
    savePersonalAccessToken: vi.fn(),
    status: 'idle',
    user: null,
}

function renderMobileMainWindow(showNavigationInCards: boolean, project: ProjectReference | null = null) {
    const rightPanelContainerRef = createRef<HTMLDivElement>()
    vi.spyOn(dataService, 'getState').mockReturnValue({ project, runningAgents: [], snapshot: null })

    return render(
        <AppThemeProvider>
            <MobileMainWindow
                auth={auth}
                cardNavigation={<nav>Board navigation</nav>}
                isMenuOpen
                leftPanel={<nav>Project navigation</nav>}
                onCloseMenu={vi.fn()}
                rightPanel={<main>Project workspace</main>}
                rightPanelContainerRef={rightPanelContainerRef}
                showNavigationInCards={showNavigationInCards}
            />
        </AppThemeProvider>,
    )
}

describe('MobileMainWindow', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        workspaceViewService.setViewMode('cards')
    })

    it('shows the project name beside the theme toggle instead of the Theme text', () => {
        const project = { branch: 'main', id: 'C:/projects/mobile-project', rootPath: 'C:/projects/mobile-project' }
        renderMobileMainWindow(true, project)

        const projectName = screen.getByTestId('project-name-label')
        const projectNameRegion = projectName.parentElement as HTMLElement
        const themeToggle = screen.getByRole('button', { name: /Switch to (dark|light) theme/ })

        expect(projectName).toHaveTextContent('mobile-project')
        expect(screen.queryByText('Theme')).toBeNull()
        expect(projectNameRegion).toHaveStyle({ flex: '1', minWidth: '0', overflow: 'hidden' })
        expect(projectNameRegion.nextElementSibling).toBe(themeToggle)
    })

    it('keeps the theme toggle at the right of the header when no project is open', () => {
        renderMobileMainWindow(true)

        const themeToggle = screen.getByRole('button', { name: /Switch to (dark|light) theme/ })
        const projectNameRegion = themeToggle.previousElementSibling as HTMLElement

        expect(screen.queryByTestId('project-name-label')).toBeNull()
        expect(projectNameRegion).toHaveStyle({ flex: '1', minWidth: '0', overflow: 'hidden' })
        expect(projectNameRegion.nextElementSibling).toBe(themeToggle)
    })

    it('shows navigation in the drawer when requested', () => {
        renderMobileMainWindow(true)

        expect(screen.getByText('Project navigation')).toBeInTheDocument()
        expect(screen.getByText('Project workspace')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'GitHub account' })).toBeInTheDocument()
    })

    it('pins project status directly above the account footer', () => {
        renderMobileMainWindow(true)

        const status = screen.getByRole('region', { name: 'Project status' })
        const footer = screen.getByRole('contentinfo')
        const separator = status.nextElementSibling

        expect(within(status).getByText('Cards')).toBeInTheDocument()
        expect(within(status).getByText('Local save')).toBeInTheDocument()
        expect(within(status).getByText('Remote push')).toBeInTheDocument()
        expect(within(status).getByRole('button', { name: 'Running agents: 0' })).toBeInTheDocument()
        expect(within(status).getByRole('button', { name: 'Agent token usage summary' })).toBeInTheDocument()
        expect(within(status).queryByText('Remote control')).toBeNull()
        expect(within(status).queryByText('Caps Lock')).toBeNull()
        expect(separator?.tagName).toBe('HR')
        expect(separator?.nextElementSibling).toBe(footer)
        expect(screen.getByTestId('mobile-navigation-scroll-region')).toHaveStyle({ overflow: 'auto' })
    })

    it('hides navigation without hiding workspace content', () => {
        renderMobileMainWindow(false)

        expect(screen.getByText('Project navigation')).not.toBeVisible()
        expect(screen.getByText('Board navigation')).toBeVisible()
        expect(screen.getByText('Project workspace')).toBeInTheDocument()
    })

    it('contains board navigation in its own vertical scroll region', () => {
        renderMobileMainWindow(false)

        const navigationRegion = screen.getByTestId('mobile-navigation-region')
        const cardScrollRegion = screen.getByTestId('mobile-card-navigation-scroll-region')

        expect(navigationRegion).toHaveStyle({ overflow: 'hidden' })
        expect(cardScrollRegion).toHaveStyle({ height: '100%', overflowX: 'hidden', overflowY: 'auto' })
        expect(cardScrollRegion).toContainElement(screen.getByText('Board navigation'))
        expect(cardScrollRegion).toBeVisible()
        expect(screen.getByTestId('mobile-navigation-scroll-region')).not.toBeVisible()
    })

    it('shows navigation in text view without rerendering it', () => {
        renderMobileMainWindow(false)
        const navigation = screen.getByText('Project navigation')

        act(() => workspaceViewService.setViewMode('text'))

        const navigationScrollRegion = screen.getByTestId('mobile-navigation-scroll-region')

        expect(screen.getByText('Project navigation')).toBe(navigation)
        expect(navigation).toBeVisible()
        expect(navigationScrollRegion).toHaveStyle({ overflow: 'auto' })
        expect(navigationScrollRegion).toContainElement(navigation)
        expect(screen.getByText('Board navigation')).not.toBeVisible()
    })

    it.each(['diagrams', 'stats'] as const)('hides both navigation surfaces in %s view', (viewMode) => {
        renderMobileMainWindow(false)

        act(() => workspaceViewService.setViewMode(viewMode))

        expect(screen.getByText('Project navigation')).not.toBeVisible()
        expect(screen.getByText('Board navigation')).not.toBeVisible()
        expect(screen.getByText('Project workspace')).toBeVisible()
    })
})
