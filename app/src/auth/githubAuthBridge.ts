import type { GithubOAuthBridge } from './githubAuthTypes'

declare global {
    interface Window {
        md2GithubAuth?: GithubOAuthBridge
    }
}

export function getGithubAuthBridge() {
    return window.md2GithubAuth ?? null
}
