import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'

vi.mock('./auth/useGithubAuth', () => ({
    useGithubAuth: () => ({
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
    it('renders the GitHub authentication shell', () => {
        render(<App />)

        expect(screen.getByRole('heading', { name: 'MD2' })).not.toBeNull()
        expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).not.toBeNull()
    })
})
