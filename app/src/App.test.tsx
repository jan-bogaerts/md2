import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './app'
import { configService, REACT_CONFIG_STORAGE_KEY } from './services/config_service'

vi.mock('./auth/use_github_auth', () => ({
    useGithubAuth: () => ({
        accessToken: null,
        deviceCode: null,
        errorMessage: null,
        isAuthenticated: false,
        isLoadingUser: false,
        login: vi.fn(),
        logout: vi.fn(),
        status: 'idle',
        user: null,
    }),
}))

describe('App', () => {
    beforeEach(() => {
        window.localStorage.clear()
    })

    afterEach(() => {
        cleanup()
        configService.clear()
        window.localStorage.clear()
    })

    it('shows the shell with the sign-in panel once startup finishes', async () => {
        render(<App />)

        expect(await screen.findByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument()
    })

    it('renders the toolbar theme toggle', async () => {
        render(<App />)

        await screen.findByRole('button', { name: 'Sign in with GitHub' })
        expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument()
    })

    it('shows the startup splash while bootstrapping by default', () => {
        render(<App />)

        expect(screen.getByText('Starting MD2...')).toBeInTheDocument()
    })

    it('skips the startup splash when the preference is disabled', () => {
        window.localStorage.setItem(REACT_CONFIG_STORAGE_KEY, JSON.stringify({ 'react.showStartupSplash': false }))

        render(<App />)

        expect(screen.queryByText('Starting MD2...')).not.toBeInTheDocument()
    })
})
