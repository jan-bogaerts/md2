import { ACTION_SCHEDULES_FILE, type AnySchedule } from '../../data/action_schedule_types'
import { getElectronActionBridge, type ElectronActionBridge } from '../../data/electron_action_bridge'
import type { ProjectReference, ProjectWatchEvent } from '../../data/data_types'
import { normalizePath } from '../../../../shared/path_utils.mjs'
import { actionService, ACTIONS_CHANGED_EVENT, type ActionService } from './action_service'
import { claudeRateLimitService, type ClaudeRateLimitService } from '../agents/claude_rate_limit_service'
import { codexRateLimitService, type CodexRateLimitService } from '../agents/codex_rate_limit_service'
import { configService } from '../config/config_service'
import { dataService, type DataService } from '../data/data_service'
import { projectAccessService } from '../project/project_access_service'
import { register } from '../service_injector'
import { projectActiveSchedules, type ActiveScheduleItem } from './active_schedule_projection'

export interface ActiveScheduleSnapshot {
    deletingScheduleIds: readonly string[]
    error: string | null
    expandedScheduleIds: readonly string[]
    items: readonly ActiveScheduleItem[]
    loading: boolean
    selectedScheduleId: string | null
}

interface ActiveScheduleServiceDependencies {
    actionService: ActionService
    claudeRateLimitService: ClaudeRateLimitService
    codexRateLimitService: CodexRateLimitService
    dataService: DataService
    getActionsFolder(): string
    getBridge(): ElectronActionBridge | null
    getProject(): ProjectReference | null
}

const EMPTY_ITEMS: readonly ActiveScheduleItem[] = []
const INITIAL_SNAPSHOT: ActiveScheduleSnapshot = {
    deletingScheduleIds: [],
    error: null,
    expandedScheduleIds: [],
    items: EMPTY_ITEMS,
    loading: false,
    selectedScheduleId: null,
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Active schedules could not be loaded'
}

function projectKey(project: ProjectReference | null) {
    return project ? `${project.id}:${project.branch}` : null
}

function defaultDependencies(): ActiveScheduleServiceDependencies {
    return {
        actionService,
        claudeRateLimitService,
        codexRateLimitService,
        dataService,
        getActionsFolder: () => configService.getProjectConfig().actionsFolder,
        getBridge: getElectronActionBridge,
        getProject: () => dataService.getState().project,
    }
}

/** Owns read-only renderer view data for schedules whose canonical state lives in Electron. */
export class ActiveScheduleService extends EventTarget {
    private readonly dependencies: ActiveScheduleServiceDependencies
    private projectKey: string | null = null
    private refreshRevision = 0
    private schedules: readonly AnySchedule[] = []
    private snapshot = INITIAL_SNAPSHOT
    private started = false

    constructor(dependencies: ActiveScheduleServiceDependencies = defaultDependencies()) {
        super()
        this.dependencies = dependencies
        register('activeScheduleService', this)
    }

    getSnapshot = () => this.snapshot

    subscribe = (onStoreChange: () => void) => {
        this.addEventListener('changed', onStoreChange)

        return () => this.removeEventListener('changed', onStoreChange)
    }

    start() {
        if (this.started) return

        this.started = true
        this.dependencies.dataService.addEventListener('changed', this.handleProjectChanged)
        this.dependencies.dataService.addEventListener('repositoryChanged', this.handleRepositoryChanged)
        this.dependencies.actionService.addEventListener(ACTIONS_CHANGED_EVENT, this.handleProjectionSourceChanged)
        this.dependencies.claudeRateLimitService.addEventListener('changed', this.handleProjectionSourceChanged)
        this.dependencies.codexRateLimitService.addEventListener('changed', this.handleProjectionSourceChanged)
        this.handleProjectChanged()
    }

    stop() {
        if (!this.started) return

        this.started = false
        this.dependencies.dataService.removeEventListener('changed', this.handleProjectChanged)
        this.dependencies.dataService.removeEventListener('repositoryChanged', this.handleRepositoryChanged)
        this.dependencies.actionService.removeEventListener(ACTIONS_CHANGED_EVENT, this.handleProjectionSourceChanged)
        this.dependencies.claudeRateLimitService.removeEventListener('changed', this.handleProjectionSourceChanged)
        this.dependencies.codexRateLimitService.removeEventListener('changed', this.handleProjectionSourceChanged)
        this.projectKey = null
        this.refreshRevision += 1
        this.schedules = []
        this.publish(INITIAL_SNAPSHOT)
    }

    async refresh() {
        const project = this.dependencies.getProject()
        if (!project) {
            this.schedules = []
            this.publish(INITIAL_SNAPSHOT)
            return
        }
        const bridge = this.dependencies.getBridge()
        if (!bridge?.listActiveSchedules) {
            this.schedules = []
            this.publish({ ...this.snapshot, error: 'Active schedules require Electron local mode', items: EMPTY_ITEMS, loading: false })
            return
        }

        const revision = ++this.refreshRevision
        const expectedProjectKey = projectKey(project)
        this.publish({ ...this.snapshot, error: null, loading: true })
        try {
            const schedules = await bridge.listActiveSchedules()
            if (revision !== this.refreshRevision || expectedProjectKey !== this.projectKey) return

            this.schedules = schedules
            this.publishProjection({ error: null, loading: false })
        } catch (error) {
            if (revision !== this.refreshRevision || expectedProjectKey !== this.projectKey) return

            this.publish({ ...this.snapshot, error: errorMessage(error), loading: false })
        }
    }

    async deleteSchedule(scheduleId: string) {
        if (this.snapshot.deletingScheduleIds.includes(scheduleId)) return
        projectAccessService.requireWritable()
        const bridge = this.dependencies.getBridge()
        if (!bridge?.deleteSchedule) throw new Error('Schedule deletion requires Electron local mode')

        this.publish({
            ...this.snapshot,
            deletingScheduleIds: [...this.snapshot.deletingScheduleIds, scheduleId],
            error: null,
        })
        try {
            await bridge.deleteSchedule(scheduleId)
            await this.refresh()
        } catch (error) {
            this.publish({ ...this.snapshot, error: errorMessage(error) })
            throw error
        } finally {
            this.publish({
                ...this.snapshot,
                deletingScheduleIds: this.snapshot.deletingScheduleIds.filter((id) => id !== scheduleId),
            })
        }
    }

    selectSchedule(scheduleId: string | null) {
        if (scheduleId !== null && !this.schedules.some(({ id }) => id === scheduleId)) return

        this.publish({ ...this.snapshot, selectedScheduleId: scheduleId })
    }

    toggleExpanded(scheduleId: string) {
        if (!this.schedules.some(({ id }) => id === scheduleId)) return
        const expanded = this.snapshot.expandedScheduleIds.includes(scheduleId)
        const expandedScheduleIds = expanded
            ? this.snapshot.expandedScheduleIds.filter((id) => id !== scheduleId)
            : [...this.snapshot.expandedScheduleIds, scheduleId]
        this.publish({ ...this.snapshot, expandedScheduleIds })
    }

    private readonly handleProjectChanged = () => {
        const nextProjectKey = projectKey(this.dependencies.getProject())
        if (nextProjectKey === this.projectKey) {
            if (nextProjectKey) this.publishProjection()
            return
        }

        this.projectKey = nextProjectKey
        this.refreshRevision += 1
        this.schedules = []
        this.publish(INITIAL_SNAPSHOT)
        if (nextProjectKey) void this.refresh()
    }

    private readonly handleRepositoryChanged = (event: Event) => {
        const { path } = (event as CustomEvent<ProjectWatchEvent>).detail
        const schedulePath = normalizePath(`${this.dependencies.getActionsFolder()}/${ACTION_SCHEDULES_FILE}`)
        if (normalizePath(path) === schedulePath) void this.refresh()
    }

    private readonly handleProjectionSourceChanged = () => this.publishProjection()

    private publishProjection(overrides: Partial<Pick<ActiveScheduleSnapshot, 'error' | 'loading'>> = {}) {
        const { snapshot } = this.dependencies.dataService.getState()
        const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
        const items = projectActiveSchedules(this.schedules, {
            actions: this.dependencies.actionService.getActions(),
            cards,
            claudeSnapshot: this.dependencies.claudeRateLimitService.getState().snapshot,
            codexSnapshot: this.dependencies.codexRateLimitService.getState().snapshot,
        })
        const scheduleIds = new Set(this.schedules.map(({ id }) => id))
        this.publish({
            ...this.snapshot,
            ...overrides,
            expandedScheduleIds: this.snapshot.expandedScheduleIds.filter((id) => scheduleIds.has(id)),
            items,
            selectedScheduleId: this.snapshot.selectedScheduleId && scheduleIds.has(this.snapshot.selectedScheduleId)
                ? this.snapshot.selectedScheduleId
                : null,
        })
    }

    private publish(snapshot: ActiveScheduleSnapshot) {
        if (snapshot === this.snapshot) return

        this.snapshot = snapshot
        this.dispatchEvent(new Event('changed'))
    }
}

export const activeScheduleService = new ActiveScheduleService()
