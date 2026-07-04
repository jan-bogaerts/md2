import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GithubAuthPanel } from './github_auth_panel'
import type { AuthSnapshot } from '../auth/github_auth_types'

const baseSnapshot: AuthSnapshot = {
    deviceCode: null,
    errorMessage: null,
    isAuthenticated: false,
    isLoadingUser: false,
    status: 'idle',
    user: null,
}

const panelActions = {
    login: vi.fn(),
    logout: vi.fn(),
}

describe('GithubAuthPanel', () => {
    it('shows the sign-in action for signed-out users', () => {
        render(<GithubAuthPanel {...baseSnapshot} {...panelActions} />)

        expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument()
    })

    it('shows the device code and verification URL while waiting', () => {
        render(
            <GithubAuthPanel
                {...baseSnapshot}
                {...panelActions}
                deviceCode={{
                    deviceCode: 'device-code',
                    expiresIn: 900,
                    interval: 5,
                    userCode: 'ABCD-1234',
                    verificationUri: 'https://github.com/login/device',
                }}
                status="waiting"
            />,
        )

        expect(screen.getByText('ABCD-1234')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'https://github.com/login/device' })).toBeInTheDocument()
    })

    it('shows GitHub identity for authenticated users', () => {
        render(
            <GithubAuthPanel
                {...baseSnapshot}
                {...panelActions}
                isAuthenticated
                status="authenticated"
                user={{
                    avatarUrl: null,
                    htmlUrl: 'https://github.com/jb',
                    id: 1,
                    login: 'jb',
                    name: 'JB',
                }}
            />,
        )

        expect(screen.getByText('JB')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: '@jb' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    })
})
