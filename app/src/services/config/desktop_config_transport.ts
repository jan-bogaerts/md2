import type { DesktopConfigValues } from './config_entries'
import { getElectronConfigBridge } from './electron_config_bridge'

export interface DesktopConfigTransport {
    loadDesktopConfig(): Promise<DesktopConfigValues>
    saveDesktopConfig(values: DesktopConfigValues): Promise<DesktopConfigValues>
}

let transportOverride: DesktopConfigTransport | null = null

export function setDesktopConfigTransportOverride(transport: DesktopConfigTransport | null) {
    transportOverride = transport
}

export async function saveDesktopConfigToHost(values: DesktopConfigValues) {
    if (transportOverride) return transportOverride.saveDesktopConfig(values)
    const bridge = getElectronConfigBridge()
    if (!bridge) throw new Error('Desktop config persistence requires the Electron desktop app or a remote connection')

    return bridge.setDesktopConfig(values)
}
