import { useEffect, useState } from 'react'
import type { GithubAuthService } from './GithubAuthService'
import { getDefaultGithubAuthService } from './defaultGithubAuthService'
import type { AuthSnapshot } from './githubAuthTypes'

interface UseGithubAuthResult extends AuthSnapshot {
    login: () => Promise<void>
    logout: () => void
}

export function useGithubAuth(service: GithubAuthService = getDefaultGithubAuthService()): UseGithubAuthResult {
    const [snapshot, setSnapshot] = useState(service.getSnapshot())

    useEffect(() => {
        const unsubscribe = service.subscribe(setSnapshot)

        void service.restoreSession()

        return unsubscribe
    }, [service])

    return {
        ...snapshot,
        login: service.login.bind(service),
        logout: service.logout.bind(service),
    }
}
