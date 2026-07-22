import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
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

function renderMobileMainWindow(shouldShowNavigationPanel: boolean) {
    return render(
        <AppThemeProvider>
            <MobileMainWindow
                auth={auth}
                isMenuOpen
                leftPanel={<nav>Project navigation</nav>}
                onCloseMenu={vi.fn()}
                rightPanel={<main>Project workspace</main>}
                shouldShowNavigationPanel={shouldShowNavigationPanel}
            />
        </AppThemeProvider>,
    )
}

describe('MobileMainWindow', () => {
    afterEach(cleanup)

    it('shows navigation in the drawer when requested', () => {
        renderMobileMainWindow(true)

        expect(screen.getByText('Project navigation')).toBeInTheDocument()
        expect(screen.getByText('Project workspace')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Switch to (dark|light) theme/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'GitHub account' })).toBeInTheDocument()
    })

    it('hides navigation without hiding workspace content', () => {
        renderMobileMainWindow(false)

        expect(screen.queryByText('Project navigation')).toBeNull()
        expect(screen.getByText('Project workspace')).toBeInTheDocument()
    })
})
