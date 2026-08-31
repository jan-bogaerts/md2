import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UseGithubAuthResult } from '../../auth/use_github_auth'
import { GithubAuthToolbarButton } from './github_auth_toolbar_button'

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

describe('GithubAuthToolbarButton', () => {
    afterEach(() => {
        cleanup()
    })

    it('shows one GitHub icon button while signed out', () => {
        render(<GithubAuthToolbarButton auth={auth} />)

        expect(screen.getAllByRole('button', { name: 'GitHub account' })).toHaveLength(1)
        expect(screen.queryByRole('img')).toBeNull()
    })

    it('shows the GitHub user image instead of a second account button while signed in', () => {
        const signedInAuth: UseGithubAuthResult = {
            ...auth,
            isAuthenticated: true,
            status: 'authenticated',
            user: {
                avatarUrl: 'https://avatars.githubusercontent.com/u/1',
                htmlUrl: 'https://github.com/jb',
                id: 1,
                login: 'jb',
                name: 'JB',
            },
        }
        render(<GithubAuthToolbarButton auth={signedInAuth} />)

        expect(screen.getAllByRole('button', { name: 'GitHub account' })).toHaveLength(1)
        expect(screen.getByRole('img', { name: 'jb' })).toHaveAttribute('src', signedInAuth.user?.avatarUrl)
    })

    it('closes the GitHub account dialog without starting an auth action', async () => {
        const signedInAuth: UseGithubAuthResult = {
            ...auth,
            isAuthenticated: true,
            status: 'authenticated',
            user: {
                avatarUrl: null,
                htmlUrl: 'https://github.com/jb',
                id: 1,
                login: 'jb',
                name: 'JB',
            },
        }
        render(<GithubAuthToolbarButton auth={signedInAuth} />)

        fireEvent.click(screen.getByRole('button', { name: 'GitHub account' }))
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))

        await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove token' })).toBeNull())
        expect(signedInAuth.logout).not.toHaveBeenCalled()
        expect(signedInAuth.savePersonalAccessToken).not.toHaveBeenCalled()
    })
})
