import { useEffect, useState } from 'react'
import { githubAuthService, initDefaultGithubAuthService, type GithubAuthService } from '../services/github_auth_service'
import type { AuthSnapshot } from './github_auth_types'

export interface UseGithubAuthResult extends AuthSnapshot {
    accessToken: string | null
    login: () => Promise<void>
    logout: () => void
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
        if (!service.isInitialized()) initDefaultGithubAuthService(service)

        void service.restoreSession()

        return () => {
            service.removeEventListener('changed', handleChanged)
        }
    }, [service])

    return {
        ...snapshot,
        accessToken: service.getAccessToken(),
        login: service.login.bind(service),
        logout: service.logout.bind(service),
    }
}
