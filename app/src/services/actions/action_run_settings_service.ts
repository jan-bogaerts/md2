import type { CardActivityFile } from '../../../../shared/card_activity.mjs'
import { parseActivityValueForMigration } from '../../../../shared/card_activity.mjs'
import type { PermissionMode, ThinkingLevel } from '../../data/agent_profiles'
import type { AgentSelectionState } from '../../data/agent_selection'
import { getElectronActionBridge } from '../../data/electron_action_bridge'
import type { ProjectReference } from '../../data/data_types'
import type { DataService } from '../data/data_service'
import { dialogService } from '../dialog_service'
import { register } from '../service_injector'

export interface ResolvedActionRunSettings {
    agent: string
    model: string
    permissionMode?: PermissionMode | ''
    thinkingLevel: ThinkingLevel
}

export interface ActionRunSettingsSnapshot {
    loadError: string | null
    loading: boolean
    settings: AgentSelectionState | null
    settingsChangedWhileWaiting: boolean
}

interface ActionRunSettingsStoreDependencies {
    load(cardInternalId: string, actionId: string): Promise<AgentSelectionState | null>
    reportError(error: unknown, fallbackMessage: string): void
    save(cardInternalId: string, actionId: string, settings: AgentSelectionState): Promise<void>
}

interface ProjectStateOwner extends EventTarget {
    getState(): Pick<ReturnType<DataService['getState']>, 'project'>
}

const INITIAL_SESSION_SNAPSHOT: ActionRunSettingsSnapshot = {
    loadError: null,
    loading: false,
    settings: null,
    settingsChangedWhileWaiting: false,
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Unknown action settings error'
}

function projectKey(project: ProjectReference | null) {
    return project ? `${project.id}\u0000${project.branch}` : null
}

async function loadPersistedSettings(cardInternalId: string, actionId: string) {
    const bridge = getElectronActionBridge()
    if (!bridge?.loadCardActivity) throw new Error('Loading card action settings requires Electron')

    const rawActivity = await bridge.loadCardActivity({ cardInternalId })
    const origin = { cardInternalId, kind: 'card' as const }
    const activity: CardActivityFile = parseActivityValueForMigration(rawActivity, origin)
    const settings = activity.actionSettings[actionId]
    if (!settings) return null

    return settings
}

async function savePersistedSettings(
    cardInternalId: string,
    actionId: string,
    settings: AgentSelectionState,
) {
    const bridge = getElectronActionBridge()
    if (!bridge?.updateCardActionSettings) throw new Error('Saving card action settings requires Electron')

    await bridge.updateCardActionSettings({ actionId, cardInternalId, settings })
}

function reportSettingsError(error: unknown, fallbackMessage: string) {
    dialogService.error(error, { fallbackMessage })
}

const DEFAULT_DEPENDENCIES: ActionRunSettingsStoreDependencies = {
    load: loadPersistedSettings,
    reportError: reportSettingsError,
    save: savePersistedSettings,
}

/** Owns one action/context setting snapshot and scoped change events. */
export class ActionRunSettingsStore extends EventTarget {
    private readonly actionId: string
    private readonly cardInternalId: string | null
    private readonly dependencies: ActionRunSettingsStoreDependencies
    private lastPersistedSettingsChangedWhileWaiting = false
    private lastPersistedSettings: AgentSelectionState | null = null
    private loadPromise: Promise<void> | null = null
    private pendingSave: Promise<void> = Promise.resolve()
    private revision = 0
    private snapshot: ActionRunSettingsSnapshot

    constructor(
        actionId: string,
        cardInternalId: string | null,
        dependencies: ActionRunSettingsStoreDependencies = DEFAULT_DEPENDENCIES,
    ) {
        super()
        if (actionId.length === 0) throw new Error('Action settings actionId is required')
        if (cardInternalId !== null && cardInternalId.length === 0) throw new Error('Action settings cardInternalId is required')
        this.actionId = actionId
        this.cardInternalId = cardInternalId
        this.dependencies = dependencies
        this.snapshot = cardInternalId
            ? { ...INITIAL_SESSION_SNAPSHOT, loading: true }
            : INITIAL_SESSION_SNAPSHOT
    }

    readonly getSnapshot = () => this.snapshot

    readonly subscribe = (onStoreChange: () => void) => {
        this.addEventListener('changed', onStoreChange)

        return () => this.removeEventListener('changed', onStoreChange)
    }

    load() {
        if (!this.cardInternalId) return Promise.resolve()
        if (!this.loadPromise) this.loadPromise = this.loadSettings(this.cardInternalId)

        return this.loadPromise
    }

    setSettings(settings: AgentSelectionState, changedWhileWaiting: boolean) {
        const cardInternalId = this.cardInternalId
        const revision = this.revision + 1
        const settingsChangedWhileWaiting = this.snapshot.settingsChangedWhileWaiting || changedWhileWaiting
        this.revision = revision
        this.publish({
            loadError: null,
            loading: false,
            settings,
            settingsChangedWhileWaiting,
        })
        if (!cardInternalId) return

        const save = this.pendingSave.catch(() => undefined).then(async () => {
            await this.dependencies.save(cardInternalId, this.actionId, settings)
            this.lastPersistedSettings = settings
            this.lastPersistedSettingsChangedWhileWaiting = settingsChangedWhileWaiting
        })
        this.pendingSave = save
        void save.catch((error: unknown) => this.handleSaveFailure(error, revision))
    }

    markSettingsApplied() {
        if (!this.snapshot.settingsChangedWhileWaiting) return

        this.publish({ ...this.snapshot, settingsChangedWhileWaiting: false })
    }

    private handleSaveFailure(error: unknown, revision: number) {
        this.dependencies.reportError(error, 'Could not save action settings')
        if (revision !== this.revision) return

        this.publish({
            ...this.snapshot,
            settings: this.lastPersistedSettings,
            settingsChangedWhileWaiting: this.lastPersistedSettingsChangedWhileWaiting,
        })
    }

    private async loadSettings(cardInternalId: string) {
        try {
            const settings = await this.dependencies.load(cardInternalId, this.actionId)
            this.lastPersistedSettings = settings
            this.publish({ ...this.snapshot, loading: false, settings })
        } catch (error) {
            this.dependencies.reportError(error, 'Could not load action settings')
            this.publish({ ...this.snapshot, loadError: errorMessage(error), loading: false })
        }
    }

    private publish(snapshot: ActionRunSettingsSnapshot) {
        this.snapshot = snapshot
        this.dispatchEvent(new CustomEvent<ActionRunSettingsSnapshot>('changed', { detail: snapshot }))
    }
}

/** Owns stable card/action and session action/context settings stores for current project. */
export class ActionRunSettingsService {
    private projectStateOwner: ProjectStateOwner | null = null
    private activeProjectKey: string | null = null
    private readonly cardStores = new Map<string, ActionRunSettingsStore>()
    private readonly sessionStores = new Map<string, ActionRunSettingsStore>()

    constructor() {
        register('actionRunSettingsService', this)
    }

    init(projectStateOwner: ProjectStateOwner) {
        if (this.projectStateOwner) return

        this.projectStateOwner = projectStateOwner
        this.activeProjectKey = projectKey(projectStateOwner.getState().project)
        projectStateOwner.addEventListener('changed', this.handleProjectChanged)
    }

    getCardStore(cardInternalId: string, actionId: string) {
        const key = `${cardInternalId}\u0000${actionId}`
        const current = this.cardStores.get(key)
        if (current) return current

        const store = new ActionRunSettingsStore(actionId, cardInternalId)
        this.cardStores.set(key, store)
        void store.load()

        return store
    }

    getSessionStore(actionId: string, contextIdentity: string) {
        if (contextIdentity.length === 0) throw new Error('Action settings context identity is required')
        const key = `${contextIdentity}\u0000${actionId}`
        const current = this.sessionStores.get(key)
        if (current) return current

        const store = new ActionRunSettingsStore(actionId, null)
        this.sessionStores.set(key, store)

        return store
    }

    clear() {
        this.cardStores.clear()
        this.sessionStores.clear()
    }

    private readonly handleProjectChanged = () => {
        if (!this.projectStateOwner) return

        const nextProjectKey = projectKey(this.projectStateOwner.getState().project)
        if (nextProjectKey === this.activeProjectKey) return

        this.activeProjectKey = nextProjectKey
        this.clear()
    }
}

export const actionRunSettingsService = new ActionRunSettingsService()
