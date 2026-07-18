import { useSyncExternalStore } from 'react'
import { configService, type ConfigKey, type ConfigValues } from '../../services/config/config_service'

type ConfigValueSnapshot<K extends ConfigKey> = ConfigValues[K]

function subscribeToConfigChanges(onStoreChange: () => void) {
    configService.addEventListener('changed', onStoreChange)

    return () => configService.removeEventListener('changed', onStoreChange)
}

export function useConfigValue<K extends ConfigKey>(key: K): ConfigValueSnapshot<K> {
    return useSyncExternalStore(
        subscribeToConfigChanges,
        () => configService.get(key),
        () => configService.get(key),
    )
}

export function useConfigValueOrFallback<K extends ConfigKey>(key: K, fallback: ConfigValueSnapshot<K>): ConfigValueSnapshot<K> {
    return useSyncExternalStore(
        subscribeToConfigChanges,
        () => configService.isInitialized() ? configService.get(key) : fallback,
        () => configService.isInitialized() ? configService.get(key) : fallback,
    )
}

export function useHasDesktopConfig(): boolean {
    return useSyncExternalStore(
        subscribeToConfigChanges,
        () => configService.hasDesktopConfig(),
        () => configService.hasDesktopConfig(),
    )
}
