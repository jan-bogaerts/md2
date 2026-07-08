import { RemoteControlStorageService } from '../services/remote_control_storage_service'
import type { StorageService } from './data_types'
import { setActionBridgeOverride } from './electron_action_bridge'
import type { StorageType } from './project_session'

/** Wire action execution for the storage backend that is becoming active. */
export function activateStorageService(storageType: StorageType, storage: StorageService) {
    if (storageType !== 'remote') {
        setActionBridgeOverride(null)

        return
    }

    if (!(storage instanceof RemoteControlStorageService)) throw new Error('Remote storage must provide the action bridge')

    setActionBridgeOverride(storage)
}
