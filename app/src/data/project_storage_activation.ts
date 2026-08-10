import { RemoteControlStorageService } from '../services/data/remote_control_storage_service'
import { agentCapabilitiesService } from '../services/agents/agent_capabilities_service'
import { codexRateLimitService } from '../services/agents/codex_rate_limit_service'
import { configService } from '../services/config/config_service'
import { setDesktopConfigTransportOverride } from '../services/config/desktop_config_transport'
import type { StorageService } from './data_types'
import { setActionBridgeOverride } from './electron_action_bridge'
import { setCodexRuntimeBridgeOverride } from './electron_codex_runtime_bridge'
import type { StorageType } from './project_session'

let activeRemoteStorage: RemoteControlStorageService | null = null
let unsubscribeRemoteConnection: (() => void) | null = null

function clearRemoteActivation(storage: RemoteControlStorageService) {
    if (activeRemoteStorage !== storage) return

    activeRemoteStorage = null
    unsubscribeRemoteConnection?.()
    unsubscribeRemoteConnection = null
    setActionBridgeOverride(null)
    setCodexRuntimeBridgeOverride(null)
    setDesktopConfigTransportOverride(null)
    if (configService.isInitialized()) configService.clearDesktopConfig()
}

function stopRemoteConnectionListener() {
    activeRemoteStorage = null
    unsubscribeRemoteConnection?.()
    unsubscribeRemoteConnection = null
}

/** Load host config, then wire action runs and await availability for the storage becoming active. */
export async function activateStorageService(storageType: StorageType, storage: StorageService) {
    if (storageType !== 'remote') {
        stopRemoteConnectionListener()
        setActionBridgeOverride(null)
        setCodexRuntimeBridgeOverride(null)
        setDesktopConfigTransportOverride(null)
        codexRateLimitService.start()
        // Availability may have been read before this bridge existed; re-read against it.
        await agentCapabilitiesService.reload()

        return
    }

    if (!(storage instanceof RemoteControlStorageService)) throw new Error('Remote storage must provide the action bridge')

    if (activeRemoteStorage === storage && configService.hasDesktopConfig()) return

    stopRemoteConnectionListener()
    try {
        const desktopConfig = await storage.loadDesktopConfig()
        configService.replaceDesktopConfig(desktopConfig)
        activeRemoteStorage = storage
        setActionBridgeOverride(storage)
        setCodexRuntimeBridgeOverride(storage)
        setDesktopConfigTransportOverride(storage)
        unsubscribeRemoteConnection = storage.onConnectionChanged((connected) => {
            if (!connected) clearRemoteActivation(storage)
        })
        codexRateLimitService.start()
        // Host config must exist before profile-based availability is requested.
        await agentCapabilitiesService.reload()
    } catch (error) {
        clearRemoteActivation(storage)
        if (configService.isInitialized() && configService.hasDesktopConfig()) configService.clearDesktopConfig()
        const message = error instanceof Error ? error.message : 'Unknown remote desktop config error'
        throw new Error(`Remote desktop config load failed: ${message}`, { cause: error })
    }
}
