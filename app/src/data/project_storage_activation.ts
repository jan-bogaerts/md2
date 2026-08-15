import { agentCapabilitiesService } from '../services/agents/agent_capabilities_service'
import { codexRateLimitService } from '../services/agents/codex_rate_limit_service'
import { claudeRateLimitService } from '../services/agents/claude_rate_limit_service'
import { remoteConnectionService } from '../services/data/remote_connection_service'
import { RemoteControlStorageService } from '../services/data/remote_control_storage_service'
import { setDesktopConfigTransportOverride } from '../services/config/desktop_config_transport'
import type { StorageService } from './data_types'
import { setActionBridgeOverride } from './electron_action_bridge'
import { setCodexRuntimeBridgeOverride } from './electron_codex_runtime_bridge'
import { setClaudeRuntimeBridgeOverride } from './electron_claude_runtime_bridge'
import type { StorageType } from './project_session'

/** Load host config, then wire action runs and await availability for the storage becoming active. */
export async function activateStorageService(storageType: StorageType, storage: StorageService) {
    if (storageType !== 'remote') {
        remoteConnectionService.disconnect()
        setActionBridgeOverride(null)
        setClaudeRuntimeBridgeOverride(null)
        setCodexRuntimeBridgeOverride(null)
        setDesktopConfigTransportOverride(null)
        claudeRateLimitService.start()
        codexRateLimitService.start()
        // Availability may have been read before this bridge existed; re-read against it.
        await agentCapabilitiesService.reload()

        return storage
    }

    if (!(storage instanceof RemoteControlStorageService)) throw new Error('Remote storage must provide the action bridge')

    return remoteConnectionService.connectExisting(storage)
}
