import { useEffect, useState } from 'react'
import { githubAuthService, type GithubAuthService } from '../services/github/github_auth_service'
import type { AuthSnapshot } from './github_auth_types'

export interface UseGithubAuthResult extends AuthSnapshot {
    accessToken: string | null
    logout: () => void
    savePersonalAccessToken: (accessToken: string) => Promise<void>
}

function getChangedSnapshot(event: Event): AuthSnapshot {
    return (event as CustomEvent<AuthSnapshot>).detail
}

export function useGithubAuth(service: GithubAuthService = githubAuthService): UseGithubAuthResult {
    const [snapshot, setSnapshot] = useState(service.getSnapshot())

    useEffect(() => {
        const handleChanged = (event: Event) => {
            setSnapshot(getChangedSnapshot(event))
        }

        service.addEventListener('changed', handleChanged)

        return () => {
            service.removeEventListener('changed', handleChanged)
        }
    }, [service])

    return {
        ...snapshot,
        accessToken: service.getAccessToken(),
        logout: service.logout.bind(service),
        savePersonalAccessToken: service.savePersonalAccessToken.bind(service),
    }
}
