import { REACT_CONFIG_STORAGE_KEY, type ConfigKey, type ConfigValues } from './config_service_core'

const LOCAL_STORAGE_KEYS: ConfigKey[] = ['react.autoCommitDelayMs', 'react.showStartupSplash', 'connection.githubScopes']

export function readStoredReactValues(): Partial<Record<ConfigKey, unknown>> {
    const raw = window.localStorage.getItem(REACT_CONFIG_STORAGE_KEY)
    if (!raw) return {}

    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid stored React config')

    return parsed as Partial<Record<ConfigKey, unknown>>
}

export function writeStoredReactValues(values: ConfigValues) {
    const stored: Partial<Record<ConfigKey, unknown>> = {}
    for (const key of LOCAL_STORAGE_KEYS) stored[key] = values[key]

    window.localStorage.setItem(REACT_CONFIG_STORAGE_KEY, JSON.stringify(stored))
}
