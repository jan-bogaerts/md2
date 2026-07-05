import { useEffect, useState } from 'react'
import { createStorageService, readLastProject, type StorageType } from '../data/project_session'
import type { ProjectReference, ProjectSnapshot } from '../data/data_types'
import { configService } from '../services/config_service'
import { dataService } from '../services/data_service'
import { getElectronConfigBridge } from '../services/electron_config_bridge'

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

/** Start services and open the last project. Returns null when there is nothing to restore. */
async function loadLastProjectSession(accessToken: string | null): Promise<ProjectSession | null> {
    const desktopConfig = getElectronConfigBridge()?.getDesktopConfig() ?? null
    configService.init({ desktopConfig })
    const lastProject = readLastProject()
    if (!lastProject) return null
    if (lastProject.storageType === 'github' && !accessToken) return null

    const storage = createStorageService(lastProject.storageType, accessToken)
    dataService.init({ storage })
    const snapshot = await dataService.openProject(lastProject.project)

    return { project: lastProject.project, snapshot, storageType: lastProject.storageType }
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
