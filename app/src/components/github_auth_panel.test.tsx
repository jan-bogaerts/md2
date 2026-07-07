import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GithubAuthPanel } from './github_auth_panel'
import type { AuthSnapshot } from '../auth/github_auth_types'

const baseSnapshot: AuthSnapshot = {
    authMethod: null,
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
    savePersonalAccessToken: vi.fn(),
}

describe('GithubAuthPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('shows the sign-in action for signed-out users', () => {
        render(<GithubAuthPanel {...baseSnapshot} {...panelActions} />)

        expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Use a personal access token' })).toBeInTheDocument()
        expect(screen.getByLabelText('Personal access token')).toBeInTheDocument()
    })

    it('saves the entered personal access token on explicit action', () => {
        render(<GithubAuthPanel {...baseSnapshot} {...panelActions} />)

        fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'pat-token' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save token' }))

        expect(panelActions.savePersonalAccessToken).toHaveBeenCalledWith('pat-token')
    })

    it('shows personal access token validation errors inline', () => {
        render(
            <GithubAuthPanel
                {...baseSnapshot}
                {...panelActions}
                errorMessage="GitHub access token is no longer authorized"
            />,
        )

        expect(screen.getByText('GitHub access token is no longer authorized')).toBeInTheDocument()
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

    it('shows GitHub identity for device-flow authenticated users', () => {
        render(
            <GithubAuthPanel
                {...baseSnapshot}
                {...panelActions}
                authMethod="device"
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
        expect(screen.getByText('Signed in with GitHub device flow.')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: '@jb' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    })

    it('shows personal access token identity and remove action for PAT auth', () => {
        render(
            <GithubAuthPanel
                {...baseSnapshot}
                {...panelActions}
                authMethod="pat"
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

        expect(screen.getByText('Signed in with personal access token.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Remove token' })).toBeInTheDocument()
    })
})
