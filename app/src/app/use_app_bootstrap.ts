import { useEffect, useState } from 'react'
import { createStorageService, readLastProject, writeLastProject, type LastProject, type StorageType } from '../data/project_session'
import { activateStorageService } from '../data/project_storage_activation'
import type { ProjectReference, ProjectSnapshot, StorageService } from '../data/data_types'
import { configService } from '../services/config_service'
import { agentCapabilitiesService } from '../services/agent_capabilities_service'
import { actionExecutionService } from '../services/action_execution_service'
import { dataService } from '../services/data_service'
import { readDesktopConfigFromBridge } from '../services/config_persistence'

export type BootstrapPhase = 'starting' | 'ready'

export interface ProjectSession {
    project: ProjectReference
    snapshot: ProjectSnapshot
    storageType: StorageType
}

interface AppBootstrapState {
    error: string | null
    phase: BootstrapPhase
    session: ProjectSession | null
}

const INITIAL_STATE: AppBootstrapState = { error: null, phase: 'starting', session: null }

function ensureConfigServiceInitialized() {
    if (configService.isInitialized()) return

    const desktopConfig = readDesktopConfigFromBridge()
    configService.init({ desktopConfig })
}

async function resolveRestoredProject(lastProject: LastProject, storage: StorageService) {
    if (lastProject.storageType !== 'local') return lastProject.project
    if (!storage.resolveProject) throw new Error('Local project validation is not available')

    return storage.resolveProject(lastProject.project)
}

/** Start services and open the last project. Returns null when there is nothing to restore. */
async function loadLastProjectSession(accessToken: string | null): Promise<ProjectSession | null> {
    ensureConfigServiceInitialized()
    actionExecutionService.start()
    await agentCapabilitiesService.initialize()
    const lastProject = readLastProject()
    if (!lastProject) return null
    if (lastProject.storageType === 'github' && !accessToken) return null

    const storage = createStorageService(lastProject.storageType, accessToken)
    const project = await resolveRestoredProject(lastProject, storage)
    dataService.init({ storage })
    activateStorageService(lastProject.storageType, storage)
    try {
        const snapshot = await dataService.projectLoading.openProject(project)
        writeLastProject(lastProject.storageType, project)

        return { project, snapshot, storageType: lastProject.storageType }
    } catch (error) {
        dataService.init({ storage })
        throw error
    }
}

/**
 * Application startup: loads the last project before the main window is shown.
 * Stays in the `starting` phase until the restore attempt settles.
 */
export function useAppBootstrap(accessToken: string | null): AppBootstrapState {
    const [state, setState] = useState<AppBootstrapState>(INITIAL_STATE)

    useEffect(() => {
        let cancelled = false

        const runBootstrap = async () => {
            try {
                const session = await loadLastProjectSession(accessToken)
                if (!cancelled) setState({ error: null, phase: 'ready', session })
            } catch (error) {
                if (!cancelled) setState({ error: error instanceof Error ? error.message : 'Startup failed', phase: 'ready', session: null })
            }
        }

        void runBootstrap()

        return () => {
            cancelled = true
        }
    }, [accessToken])

    return state
}
