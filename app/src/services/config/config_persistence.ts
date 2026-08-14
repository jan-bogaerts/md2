import {
    LOCAL_STORAGE_KEYS,
    requireConfigEntry,
    type ConfigKey,
    type ConfigValues,
    type DesktopConfigValues,
} from './config_entries'
import { getElectronConfigBridge } from './electron_config_bridge'

export const REACT_CONFIG_STORAGE_KEY = 'md2.reactConfig'

type MergeConfigValue = (values: ConfigValues, key: ConfigKey, value: unknown) => ConfigValues

export function readStoredReactValues(): Partial<Record<ConfigKey, unknown>> {
    const raw = window.localStorage.getItem(REACT_CONFIG_STORAGE_KEY)
    if (!raw) return {}

    try {
        const parsed = JSON.parse(raw) as unknown

        return parsed && typeof parsed === 'object' ? (parsed as Partial<Record<ConfigKey, unknown>>) : {}
    } catch {
        return {}
    }
}

export function writeStoredReactValues(values: ConfigValues) {
    const stored: Partial<Record<ConfigKey, unknown>> = {}
    for (const key of LOCAL_STORAGE_KEYS) stored[key] = values[key]

    window.localStorage.setItem(REACT_CONFIG_STORAGE_KEY, JSON.stringify(stored))
}

export function mergeStoredReactValues(values: ConfigValues, mergeValue: MergeConfigValue): ConfigValues {
    let nextValues = values
    const stored = readStoredReactValues()

    for (const key of LOCAL_STORAGE_KEYS) {
        if (stored[key] === undefined) continue

        try {
            nextValues = mergeValue(nextValues, key, stored[key])
        } catch {
            // ignore invalid persisted value, keep the default
        }
    }

    return nextValues
}

/** Read the startup-splash preference straight from storage, for use before the config service initializes. */
export function readStartupSplashPreference(): boolean {
    const stored = readStoredReactValues()['react.showStartupSplash']

    return typeof stored === 'boolean' ? stored : (requireConfigEntry('react.showStartupSplash').defaultValue as boolean)
}

export function readDesktopConfigFromBridge(): Partial<DesktopConfigValues> | null {
    return getElectronConfigBridge()?.getDesktopConfig() ?? null
}

export function writeDesktopConfigToBridge(values: DesktopConfigValues) {
    void getElectronConfigBridge()?.setDesktopConfig(values)
}
