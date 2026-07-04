import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
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
})
