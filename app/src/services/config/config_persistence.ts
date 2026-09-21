import type { DesktopConfigValues } from './config_entries'
import { getElectronConfigBridge } from './electron_config_bridge'

export function readDesktopConfigFromBridge(): Partial<DesktopConfigValues> | null {
    return getElectronConfigBridge()?.getDesktopConfig() ?? null
}

export function writeDesktopConfigToBridge(values: DesktopConfigValues) {
    void getElectronConfigBridge()?.setDesktopConfig(values)
}
