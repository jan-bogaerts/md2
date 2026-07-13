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
