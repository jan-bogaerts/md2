import {
    getElectronApplicationStateBridge,
    type ElectronApplicationStateBridge,
} from './electron_application_state_bridge'

export const APPLICATION_STATE_MIGRATION_KEY = 'md2.localStorageMigrationComplete'
export const APPLICATION_STATE_MIGRATION_VALUE = '1'

export const MIGRATED_APPLICATION_STORAGE_KEYS = [
    'md2.actionPromptHeight',
    'md2.actionQuestionsBlockHeight',
    'md2.cardBodyPopover.size',
    'md2.cardRunPopupSize',
    'md2.colorScheme',
    'md2.customMarkdownStyle',
    'md2.github.accessToken',
    'md2.github.pendingCommitHeads',
    'md2.lastProject',
    'md2.markdownFileSearchMenuSize',
    'md2.markdownStyle',
    'md2.projectAgentPopupSize',
    'md2.reactConfig',
    'md2.recentLocalRepositories',
    'md2.remoteControl.endpoint',
    'md2.sentry.connections',
    'md2.splitWidth',
    'md2.themeMode',
    'search-panel-results-size',
] as const

function requireStoredValues(value: Record<string, string> | string | null): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Desktop application-state snapshot is invalid')
    }
    if (Object.values(value).some((storedValue) => typeof storedValue !== 'string')) {
        throw new Error('Desktop application-state snapshot values must be strings')
    }

    return { ...value }
}

function requireStoredValue(value: Record<string, string> | string | null): string | null {
    if (value === null || typeof value === 'string') return value

    throw new Error('Desktop application-state value is invalid')
}

function requireBrowserMode() {
    if (getElectronApplicationStateBridge()) {
        throw new Error('Desktop application state must be initialized before use')
    }
}

async function migrateLegacyValues(bridge: ElectronApplicationStateBridge, storedValues: Record<string, string>) {
    if (storedValues[APPLICATION_STATE_MIGRATION_KEY] === APPLICATION_STATE_MIGRATION_VALUE) return

    for (const key of MIGRATED_APPLICATION_STORAGE_KEYS) {
        if (storedValues[key] !== undefined) continue

        const legacyValue = window.localStorage.getItem(key)
        if (legacyValue === null) continue

        await bridge.write(key, legacyValue)
        storedValues[key] = legacyValue
    }

    await bridge.write(APPLICATION_STATE_MIGRATION_KEY, APPLICATION_STATE_MIGRATION_VALUE)
    storedValues[APPLICATION_STATE_MIGRATION_KEY] = APPLICATION_STATE_MIGRATION_VALUE
}

async function removeDesktopValue(bridge: ElectronApplicationStateBridge, key: string) {
    try {
        await bridge.remove(key)
    } catch (error) {
        console.error('Desktop application-state remove failed', error)
    }
}

async function writeDesktopValue(bridge: ElectronApplicationStateBridge, key: string, value: string) {
    try {
        await bridge.write(key, value)
    } catch (error) {
        console.error('Desktop application-state write failed', error)
    }
}

/** Provides synchronous reads from a loaded desktop snapshot or browser localStorage. */
export class ApplicationStorage implements Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> {
    private bridge: ElectronApplicationStateBridge | null = null
    private desktopValues: Record<string, string> | null = null

    async initialize() {
        const bridge = getElectronApplicationStateBridge()
        if (!bridge) return

        const storedValues = requireStoredValues(await bridge.read(null))
        await migrateLegacyValues(bridge, storedValues)
        this.bridge = bridge
        this.desktopValues = storedValues
    }

    getItem(key: string) {
        if (this.desktopValues) return this.desktopValues[key] ?? null
        requireBrowserMode()

        return window.localStorage.getItem(key)
    }

    removeItem(key: string) {
        if (this.desktopValues && this.bridge) {
            delete this.desktopValues[key]
            void removeDesktopValue(this.bridge, key)

            return
        }
        requireBrowserMode()
        window.localStorage.removeItem(key)
    }

    setItem(key: string, value: string) {
        if (this.desktopValues && this.bridge) {
            this.desktopValues[key] = value
            void writeDesktopValue(this.bridge, key, value)

            return
        }
        requireBrowserMode()
        window.localStorage.setItem(key, value)
    }

    async readCurrentItem(key: string) {
        if (!this.desktopValues || !this.bridge) {
            requireBrowserMode()

            return window.localStorage.getItem(key)
        }

        const value = requireStoredValue(await this.bridge.read(key))
        if (value === null) delete this.desktopValues[key]
        else this.desktopValues[key] = value

        return value
    }

    async writeCurrentItem(key: string, value: string) {
        if (!this.desktopValues || !this.bridge) {
            requireBrowserMode()
            window.localStorage.setItem(key, value)

            return
        }

        await this.bridge.write(key, value)
        this.desktopValues[key] = value
    }

}

export const applicationStorage = new ApplicationStorage()
