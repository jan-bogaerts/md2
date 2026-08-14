import { useEffect, useMemo, useState } from 'react'
import {
    getElectronRemoteControlBridge,
    type ElectronRemoteControlBridge,
    type RemoteControlStatus,
} from '../../data/electron_remote_control_bridge'
import { dialogService } from '../../services/dialog_service'

const INITIAL_STATUS: RemoteControlStatus = { active: false, clientCount: 0, endpoint: null }

interface MountState {
    isMounted: boolean
}

async function loadStatus(
    bridge: ElectronRemoteControlBridge,
    mountState: MountState,
    setStatus: (status: RemoteControlStatus) => void,
) {
    try {
        const nextStatus = await bridge.getStatus()
        if (mountState.isMounted) setStatus(nextStatus)
    } catch (error) {
        if (mountState.isMounted) dialogService.error(error, { fallbackMessage: 'Remote-control status failed' })
    }
}

/** Subscribes to the Electron remote-control bridge and tracks its live status. `bridge` is null outside Electron. */
export function useRemoteControlStatus() {
    const bridge = useMemo(() => getElectronRemoteControlBridge(), [])
    const [status, setStatus] = useState<RemoteControlStatus>(INITIAL_STATUS)

    useEffect(() => {
        if (!bridge) return undefined

        const mountState: MountState = { isMounted: true }
        const unsubscribe = bridge.onStatusChange(setStatus)
        void loadStatus(bridge, mountState, setStatus)

        return () => {
            mountState.isMounted = false
            unsubscribe()
        }
    }, [bridge])

    return { bridge, status, setStatus }
}
