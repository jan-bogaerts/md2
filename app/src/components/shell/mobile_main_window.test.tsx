import { act, cleanup, render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
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

function renderMobileMainWindow(showNavigationInCards: boolean) {
    const rightPanelContainerRef = createRef<HTMLDivElement>()

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
        workspaceViewService.setViewMode('cards')
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

    it('shows navigation in text view without rerendering it', () => {
        renderMobileMainWindow(false)
        const navigation = screen.getByText('Project navigation')

        act(() => workspaceViewService.setViewMode('text'))

        expect(screen.getByText('Project navigation')).toBe(navigation)
        expect(navigation).toBeVisible()
        expect(screen.getByText('Board navigation')).not.toBeVisible()
    })
})
