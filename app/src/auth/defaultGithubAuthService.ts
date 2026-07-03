import { createGithubAuthService } from './GithubAuthService'

let defaultGithubAuthService: ReturnType<typeof createGithubAuthService> | null = null

export function getDefaultGithubAuthService() {
    defaultGithubAuthService ??= createGithubAuthService()

    return defaultGithubAuthService
}
