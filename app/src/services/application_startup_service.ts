import { actionMarkdownDataSource } from '../components/editor/action_markdown_data_source'
import { cardMarkdownDataSource } from '../components/editor/card_markdown_data_source'
import { readDesktopConfigFromBridge } from './config/config_persistence'
import { configService } from './config/config_service'
import { actionRunRegistry } from './actions/action_run_registry'
import { actionRunSettingsService } from './actions/action_run_settings_service'
import { actionService } from './actions/action_service'
import { agentCapabilitiesService } from './agents/agent_capabilities_service'
import { codexCliUpdateService } from './agents/codex_cli_update_service'
import { codexRateLimitService } from './agents/codex_rate_limit_service'
import { dataService } from './data/data_service'
import { githubAuthService, initDefaultGithubAuthService } from './github/github_auth_service'
import { openFilesService } from './open_files_service'
import { isProjectLoadErrorReported } from './project/project_loading'
import { projectPersistenceService } from './project/project_persistence_service'
import { projectSessionService } from './project/project_session_service'
import { register } from './service_injector'
import { initDefaultSentryConnectionService, sentryConnectionService } from './sentry/sentry_connection_service'
import { sentryImportService } from './sentry/sentry_import_service'

export type ApplicationStartupPhase = 'ready' | 'starting'

export interface ApplicationStartupSnapshot {
    error: string | null
    phase: ApplicationStartupPhase
}

export interface ApplicationStartupDependencies {
    getGithubAccessToken(): string | null
    initializeAgentCapabilities(): Promise<void>
    initializeServices(): void
    restoreGithubSession(): Promise<void>
    restoreLastProject(accessToken: string | null): Promise<void>
}

const INITIAL_SNAPSHOT: ApplicationStartupSnapshot = { error: null, phase: 'starting' }

function initializeServices() {
    const desktopConfig = readDesktopConfigFromBridge()
    configService.init({ desktopConfig })
    initDefaultGithubAuthService(githubAuthService)
    initDefaultSentryConnectionService(sentryConnectionService)
    openFilesService.init({ actionService, dataService })
    projectPersistenceService.init({ actionService, dataService, openFilesService })
    cardMarkdownDataSource.init(dataService)
    actionMarkdownDataSource.init(actionService)
    actionRunRegistry.start()
    actionRunSettingsService.init(dataService)
    codexCliUpdateService.start()
    codexRateLimitService.start()
    sentryImportService.start()
}

const DEFAULT_DEPENDENCIES: ApplicationStartupDependencies = {
    getGithubAccessToken: () => githubAuthService.getAccessToken(),
    initializeAgentCapabilities: () => agentCapabilitiesService.initialize(),
    initializeServices,
    restoreGithubSession: () => githubAuthService.restoreSession(),
    restoreLastProject: (accessToken) => projectSessionService.restoreLastProject(accessToken),
}

/** Initializes renderer services and restores root project data once per application run. */
export class ApplicationStartupService extends EventTarget {
    private readonly dependencies: ApplicationStartupDependencies
    private snapshot = INITIAL_SNAPSHOT
    private startupPromise: Promise<void> | null = null

    constructor(dependencies: ApplicationStartupDependencies = DEFAULT_DEPENDENCIES) {
        super()
        this.dependencies = dependencies
        register('applicationStartupService', this)
    }

    getSnapshot() {
        return this.snapshot
    }

    start() {
        if (!this.startupPromise) this.startupPromise = this.runStartup()

        return this.startupPromise
    }

    private async runStartup() {
        try {
            this.dependencies.initializeServices()
            await Promise.all([
                this.dependencies.restoreGithubSession(),
                this.dependencies.initializeAgentCapabilities(),
            ])
            await this.dependencies.restoreLastProject(this.dependencies.getGithubAccessToken())
            this.setSnapshot({ error: null, phase: 'ready' })
        } catch (error) {
            const message = isProjectLoadErrorReported(error)
                ? null
                : error instanceof Error ? error.message : 'Startup failed'
            this.setSnapshot({ error: message, phase: 'ready' })
        }
    }

    private setSnapshot(snapshot: ApplicationStartupSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<ApplicationStartupSnapshot>('changed', { detail: snapshot }))
    }
}

export const applicationStartupService = new ApplicationStartupService()
