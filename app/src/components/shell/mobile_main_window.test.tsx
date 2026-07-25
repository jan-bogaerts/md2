import { act, cleanup, render, screen } from '@testing-library/react'
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
    return render(
        <AppThemeProvider>
            <MobileMainWindow
                auth={auth}
                isMenuOpen
                leftPanel={<nav>Project navigation</nav>}
                onCloseMenu={vi.fn()}
                rightPanel={<main>Project workspace</main>}
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

    it('hides navigation without hiding workspace content', () => {
        renderMobileMainWindow(false)

        expect(screen.getByText('Project navigation')).not.toBeVisible()
        expect(screen.getByText('Project workspace')).toBeInTheDocument()
    })

    it('shows navigation in text view without rerendering it', () => {
        renderMobileMainWindow(false)
        const navigation = screen.getByText('Project navigation')

        act(() => workspaceViewService.setViewMode('text'))

        expect(screen.getByText('Project navigation')).toBe(navigation)
        expect(navigation).toBeVisible()
    })
})
