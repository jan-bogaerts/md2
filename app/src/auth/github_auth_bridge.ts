import type { GithubOAuthBridge } from './github_auth_types'

declare global {
    interface Window {
        md2GithubAuth?: GithubOAuthBridge
    }
}

export function getGithubAuthBridge() {
    return window.md2GithubAuth ?? null
}
