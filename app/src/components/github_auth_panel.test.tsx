import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GithubAuthPanel } from './github_auth_panel'
import type { AuthSnapshot } from '../auth/github_auth_types'
import { DialogDisplay } from './dialog_display'

const baseSnapshot: AuthSnapshot = {
    errorMessage: null,
    isAuthenticated: false,
    isLoadingUser: false,
    status: 'idle',
    user: null,
}

const panelActions = {
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

    it('shows the personal access token field for signed-out users', () => {
        render(<GithubAuthPanel {...baseSnapshot} {...panelActions} />)

        expect(screen.getByLabelText('Personal access token')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save token' })).toBeDisabled()
    })

    it('disables the token field while validating a personal access token', () => {
        render(<GithubAuthPanel {...baseSnapshot} {...panelActions} isLoadingUser />)

        expect(screen.getByLabelText('Personal access token')).toBeDisabled()
    })

    it('saves the entered personal access token on explicit action', () => {
        render(<GithubAuthPanel {...baseSnapshot} {...panelActions} />)

        fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'pat-token' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save token' }))

        expect(panelActions.savePersonalAccessToken).toHaveBeenCalledWith('pat-token')
    })

    it('reports personal access token validation errors through the dialog display', async () => {
        render(
            <>
                <DialogDisplay />
                <GithubAuthPanel
                    {...baseSnapshot}
                    {...panelActions}
                    errorMessage="GitHub access token is no longer authorized"
                />
            </>,
        )

        expect(await screen.findByText('GitHub access token is no longer authorized')).toBeInTheDocument()
    })

    it('shows personal access token identity and remove action for authenticated users', () => {
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
        expect(screen.getByText('Signed in with personal access token.')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: '@jb' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Remove token' })).toBeInTheDocument()
    })
})
