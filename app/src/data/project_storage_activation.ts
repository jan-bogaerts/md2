import { RemoteControlStorageService } from '../services/data/remote_control_storage_service'
import { agentCapabilitiesService } from '../services/agents/agent_capabilities_service'
import { codexRateLimitService } from '../services/agents/codex_rate_limit_service'
import type { StorageService } from './data_types'
import { setActionBridgeOverride } from './electron_action_bridge'
import { setCodexRuntimeBridgeOverride } from './electron_codex_runtime_bridge'
import type { StorageType } from './project_session'

/** Wire action runs for the storage backend that is becoming active. */
export function activateStorageService(storageType: StorageType, storage: StorageService) {
    if (storageType !== 'remote') {
        setActionBridgeOverride(null)
        setCodexRuntimeBridgeOverride(null)
        codexRateLimitService.start()
        // Availability may have been read before this bridge existed; re-read against it.
        void agentCapabilitiesService.reload()

        return
    }

    if (!(storage instanceof RemoteControlStorageService)) throw new Error('Remote storage must provide the action bridge')

    setActionBridgeOverride(storage)
    setCodexRuntimeBridgeOverride(storage)
    codexRateLimitService.start()
    // The remote bridge only becomes the availability source now; discard any pre-connect result.
    void agentCapabilitiesService.reload()
}
