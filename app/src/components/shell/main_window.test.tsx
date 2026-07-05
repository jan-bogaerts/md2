import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { configService } from '../../services/config_service'
import { MainWindow } from './main_window'

const auth: UseGithubAuthResult = {
    accessToken: null,
    deviceCode: null,
    errorMessage: null,
    isAuthenticated: false,
    isLoadingUser: false,
    login: vi.fn(),
    logout: vi.fn(),
    status: 'idle',
    user: null,
}

function renderWindow(overrides?: Partial<Parameters<typeof MainWindow>[0]>) {
    return render(
        <MainWindow
            agents={[]}
            auth={auth}
            session={null}
            toolbarAction={<button type="button">Action</button>}
            {...overrides}
        />,
    )
}

function mockMatchMedia(matches: boolean) {
    window.matchMedia = ((query: string) => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches,
        media: query,
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

describe('MainWindow', () => {
    afterEach(() => {
        cleanup()
        configService.clear()
        window.history.pushState(null, '', '/')
        mockMatchMedia(false)
    })

    it('shows both panels and the status bar on desktop', () => {
        mockMatchMedia(false)
        renderWindow()

        expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Active cards' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Running agents: 0' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull()
    })

    it('moves the left panel into a hamburger drawer on mobile', () => {
        mockMatchMedia(true)
        renderWindow()

        expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
        expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument()
    })

    it('opens the config page from the toolbar', () => {
        mockMatchMedia(false)
        renderWindow()

        fireEvent.click(screen.getByRole('button', { name: 'Open config' }))

        expect(screen.getByRole('heading', { name: 'Config' })).toBeInTheDocument()
        expect(window.location.pathname).toBe('/config')
    })

    it('opens the config page directly from the URL', () => {
        window.history.pushState(null, '', '/config#connection')
        mockMatchMedia(false)
        renderWindow()

        expect(screen.getByRole('heading', { name: 'Config' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Connection' })).toBeInTheDocument()
    })
})
