import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

vi.mock('./auth/useGithubAuth', () => ({
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
})
