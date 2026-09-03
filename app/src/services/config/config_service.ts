import {
    defaultColumnAccent,
    type CardTypeConfig,
    type ProjectConfig,
    type StateConfig,
} from '../../data/data_types'
import { LEGACY_CARD_SEPARATOR } from '../../data/card_identifiers'
import { migrateAgentProfiles, validateAgentProfiles, type AgentProfile } from '../../data/agent_profiles'
import { validateAgentSelectionState } from '../../data/agent_selection'
import {
    CONFIG_ENTRIES,
    createDefaultValues,
    DESKTOP_KEYS,
    PROJECT_KEYS,
    requireConfigEntry,
    type ConfigEntry,
    type ConfigKey,
    type ConfigSource,
    type ConfigValue,
    type ConfigValueTypes,
    type ConfigValues,
    type DesktopConfigValues,
} from './config_entries'
import {
    mergeStoredReactValues,
    writeStoredReactValues,
} from './config_persistence'
import { register } from '../service_injector'

export {
    CONFIG_ENTRIES,
    CONFIG_SECTIONS,
    type ConfigEntry,
    type ConfigKey,
    type ConfigOption,
    type ConfigSource,
    type ConfigValue,
    type ConfigValueTypes,
    type ConfigValues,
    type ConfigValueType,
    type DesktopConfigValues,
} from './config_entries'
export { REACT_CONFIG_STORAGE_KEY, readStartupSplashPreference } from './config_persistence'

interface ConfigServiceInitDependencies {
    desktopConfig?: Partial<DesktopConfigValues> | null
}

type ReactConfigKey = Extract<ConfigKey, `react.${string}`>

function requireString(value: unknown, fieldName: string) {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing config field: ${fieldName}`)

    return value
}

function requireNumber(value: unknown, fieldName: string) {
    if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(`Missing config field: ${fieldName}`)

    return value
}

function requireBoolean(value: unknown, fieldName: string) {
    if (typeof value !== 'boolean') throw new Error(`Missing config field: ${fieldName}`)

    return value
}

function normalizeConfigPath(value: string, fieldName: string, allowEmpty = false) {
    const normalized = value.replace(/\\/gu, '/').replace(/\/+/gu, '/').replace(/^\/+|\/+$/gu, '')
    if (!allowEmpty && normalized.length === 0) throw new Error(`Missing config field: ${fieldName}`)
    if (/^[a-zA-Z]:/u.test(value) || value.startsWith('/') || value.startsWith('\\')) {
        throw new Error(`Config path ${fieldName} must be repository-relative`)
    }
    if (normalized.split('/').some((segment) => segment === '.' || segment === '..')) {
        throw new Error(`Config path ${fieldName} must stay inside the project folder`)
    }

    return normalized
}

const PROJECT_SUBFOLDER_KEYS = [
    'project.workingFolder',
    'project.actionsFolder',
    'project.releasesFolder',
    'project.archivedFolder',
    'project.diagramsFolder',
] as const

function validateProjectFolderPaths(values: ConfigValues) {
    const configuredPaths: Array<{ key: ConfigKey; path: string }> = []

    for (const key of PROJECT_SUBFOLDER_KEYS) {
        const path = values[key].toLowerCase()
        const conflict = configuredPaths.find(({ path: configuredPath }) => (
            path === configuredPath
            || path.startsWith(`${configuredPath}/`)
            || configuredPath.startsWith(`${path}/`)
        ))
        if (conflict) throw new Error(`Config folders ${conflict.key} and ${key} must not overlap`)

        configuredPaths.push({ key, path })
    }
}

function validateCardTypes(value: unknown): CardTypeConfig[] {
    if (!Array.isArray(value) || value.length === 0) throw new Error('Missing config field: project.cardTypes')

    return value.map((cardType, index) => {
        const item = cardType as Partial<CardTypeConfig>

        return {
            color: requireString(item.color, `project.cardTypes[${index}].color`),
            idPrefix: requireString(item.idPrefix, `project.cardTypes[${index}].idPrefix`),
            label: requireString(item.label, `project.cardTypes[${index}].label`),
            type: requireString(item.type, `project.cardTypes[${index}].type`) as CardTypeConfig['type'],
        }
    })
}

function validateStates(value: unknown): StateConfig[] {
    if (!Array.isArray(value) || value.length === 0) throw new Error('Missing config field: project.states')

    const states = value.map((stateConfig, index) => {
        const item = stateConfig as Partial<StateConfig>
        const color = item.color === undefined || item.color === null || item.color === ''
            ? defaultColumnAccent(index)
            : requireString(item.color, `project.states[${index}].color`)

        return {
            alwaysVisible: requireBoolean(item.alwaysVisible, `project.states[${index}].alwaysVisible`),
            color,
            ...(item.defaultActionId === undefined
                ? {}
                : { defaultActionId: requireString(item.defaultActionId, `project.states[${index}].defaultActionId`) }),
            state: requireString(item.state, `project.states[${index}].state`),
        }
    })
    const uniqueStates = new Set(states.map(({ state }) => state))
    if (uniqueStates.size !== states.length) throw new Error('Config field project.states contains duplicate states')

    return states
}

function validateDesktopAgentProfiles(value: unknown): AgentProfile[] {
    return validateAgentProfiles(migrateAgentProfiles(value))
}

function validateOption(value: string, entry: ConfigEntry) {
    if (!entry.options) return value
    if (!entry.options.some((option) => option.value === value)) throw new Error(`Invalid config value for ${entry.key}: ${value}`)

    return value
}

function validateValue<K extends ConfigKey>(key: K, value: unknown): ConfigValueTypes[K] {
    const entry = requireConfigEntry(key)

    if (entry.type === 'boolean') return requireBoolean(value, entry.key) as ConfigValueTypes[K]
    if (entry.type === 'number') {
        const numberValue = requireNumber(value, entry.key)
        if (entry.integer && !Number.isInteger(numberValue)) throw new Error(`Config value ${entry.key} must be an integer`)
        if (entry.min !== undefined && numberValue < entry.min) throw new Error(`Config value ${entry.key} is below ${entry.min}`)
        if (entry.max !== undefined && numberValue > entry.max) throw new Error(`Config value ${entry.key} is above ${entry.max}`)

        return numberValue as ConfigValueTypes[K]
    }
    if (entry.type === 'json' && key === 'project.cardTypes') return validateCardTypes(value) as ConfigValueTypes[K]
    if (entry.type === 'json' && key === 'project.states') return validateStates(value) as ConfigValueTypes[K]
    if (entry.type === 'json' && key === 'desktop.agentProfiles') return validateDesktopAgentProfiles(value) as ConfigValueTypes[K]
    if (entry.type === 'json' && key === 'desktop.agentSelection') {
        return validateAgentSelectionState(value, entry.key) as ConfigValueTypes[K]
    }
    if (key === 'project.projectFolder') {
        if (typeof value !== 'string') throw new Error(`Missing config field: ${entry.key}`)

        return normalizeConfigPath(value, entry.key, true) as ConfigValueTypes[K]
    }
    if (
        key === 'project.workingFolder'
        || key === 'project.actionsFolder'
        || key === 'project.releasesFolder'
        || key === 'project.archivedFolder'
        || key === 'project.diagramsFolder'
    ) {
        return normalizeConfigPath(requireString(value, entry.key), entry.key) as ConfigValueTypes[K]
    }
    if (key === 'project.diagramFooter') {
        const diagramFooter = requireString(value, entry.key)
        if (!diagramFooter.includes('{{diagram-file}}')) {
            throw new Error('Config field project.diagramFooter requires {{diagram-file}} placeholder')
        }

        return diagramFooter as ConfigValueTypes[K]
    }
    if (key === 'desktop.editorCommand') {
        const editorCommand = requireString(value, entry.key)
        if (!editorCommand.includes('{{file}}')) throw new Error('Config field desktop.editorCommand requires {{file}} placeholder')

        return editorCommand as ConfigValueTypes[K]
    }
    if (key === 'desktop.mergeConflictResolverCommand') {
        if (typeof value !== 'string') throw new Error(`Missing config field: ${entry.key}`)
        if (value.length > 0 && !value.includes('{{file}}')) {
            throw new Error('Config field desktop.mergeConflictResolverCommand requires {{file}} placeholder when configured')
        }

        return value as ConfigValueTypes[K]
    }

    return validateOption(requireString(value, entry.key), entry) as ConfigValueTypes[K]
}

function mergeValue<K extends ConfigKey>(values: ConfigValues, key: K, value: unknown): ConfigValues {
    return { ...values, [key]: validateValue(key, value) }
}

function readProjectConfig(values: ConfigValues): ProjectConfig {
    return {
        actionsFolder: values['project.actionsFolder'],
        archivedFolder: values['project.archivedFolder'],
        backgroundShade: values['project.backgroundShade'],
        cardSeparator: values['project.cardSeparator'],
        cardTypes: values['project.cardTypes'],
        diffCommand: values['project.diffCommand'],
        diagramFooter: values['project.diagramFooter'],
        diagramsFolder: values['project.diagramsFolder'],
        projectFolder: values['project.projectFolder'],
        pushMode: values['project.pushMode'],
        releasesFolder: values['project.releasesFolder'],
        states: values['project.states'],
        workingFolder: values['project.workingFolder'],
    }
}

function readDesktopConfig(values: ConfigValues): DesktopConfigValues {
    return {
        agentSelection: values['desktop.agentSelection'],
        agentProfiles: values['desktop.agentProfiles'],
        codexSearchEnabled: values['desktop.codexSearchEnabled'],
        editorCommand: values['desktop.editorCommand'],
        mergeConflictResolverCommand: values['desktop.mergeConflictResolverCommand'],
        remoteControlPort: values['desktop.remoteControlPort'],
    }
}

function isConfigValueEqual(first: ConfigValue, second: ConfigValue) {
    if (Object.is(first, second)) return true

    return JSON.stringify(first) === JSON.stringify(second)
}

function replaceDesktopValues(values: ConfigValues, desktopConfig: Partial<DesktopConfigValues> | null) {
    const defaults = createDefaultValues()
    let nextValues = values
    for (const key of DESKTOP_KEYS) nextValues = { ...nextValues, [key]: defaults[key] }

    if (!desktopConfig) return nextValues
    if (desktopConfig.agentSelection !== undefined) {
        nextValues = mergeValue(nextValues, 'desktop.agentSelection', desktopConfig.agentSelection)
    }
    if (desktopConfig.agentProfiles !== undefined) nextValues = mergeValue(nextValues, 'desktop.agentProfiles', desktopConfig.agentProfiles)
    if (desktopConfig.codexSearchEnabled !== undefined) {
        nextValues = mergeValue(nextValues, 'desktop.codexSearchEnabled', desktopConfig.codexSearchEnabled)
    }
    if (desktopConfig.editorCommand !== undefined) nextValues = mergeValue(nextValues, 'desktop.editorCommand', desktopConfig.editorCommand)
    if (desktopConfig.mergeConflictResolverCommand !== undefined) {
        nextValues = mergeValue(nextValues, 'desktop.mergeConflictResolverCommand', desktopConfig.mergeConflictResolverCommand)
    }

    return nextValues
}

export class ConfigService extends EventTarget {
    private desktopAvailable: boolean
    private draftValues: ConfigValues | null
    private initialized: boolean
    private projectLoaded: boolean
    private values: ConfigValues

    constructor() {
        super()
        this.desktopAvailable = false
        this.draftValues = null
        this.initialized = false
        this.projectLoaded = false
        this.values = createDefaultValues()
        register('configService', this)
    }

    init(dependencies: ConfigServiceInitDependencies = {}) {
        let nextValues = createDefaultValues()
        const { desktopConfig } = dependencies
        this.desktopAvailable = !!desktopConfig
        this.projectLoaded = false
        this.draftValues = null

        nextValues = mergeStoredReactValues(nextValues, mergeValue)

        nextValues = replaceDesktopValues(nextValues, desktopConfig ?? null)

        this.initialized = true
        this.values = nextValues
        this.dispatchChanged()
    }

    getEntries(): ConfigEntry[] {
        this.requireInitialized()

        return CONFIG_ENTRIES.filter((entry) => {
            if (entry.source === 'desktop') return true
            if (entry.source === 'project') return this.projectLoaded

            return true
        })
    }

    get<K extends ConfigKey>(key: K): ConfigValueTypes[K] {
        this.requireInitialized()

        return this.values[key]
    }

    set<K extends ConfigKey>(key: K, value: ConfigValueTypes[K]) {
        this.requireInitialized()
        this.values = mergeValue(this.values, key, value)
        this.dispatchChanged()
    }

    setReactPreference<K extends ReactConfigKey>(key: K, value: ConfigValueTypes[K]) {
        this.requireInitialized()
        this.values = mergeValue(this.values, key, value)
        writeStoredReactValues(this.values)
        this.dispatchChanged()
    }

    clear() {
        this.values = createDefaultValues()
        this.draftValues = null
        this.desktopAvailable = false
        this.projectLoaded = false
        this.initialized = false
        this.dispatchChanged()
    }

    replaceDesktopConfig(desktopConfig: Partial<DesktopConfigValues>) {
        this.requireInitialized()
        this.values = replaceDesktopValues(this.values, desktopConfig)
        if (this.draftValues) this.draftValues = replaceDesktopValues(this.draftValues, desktopConfig)
        this.desktopAvailable = true
        this.dispatchChanged()
    }

    clearDesktopConfig() {
        this.requireInitialized()
        this.values = replaceDesktopValues(this.values, null)
        if (this.draftValues) this.draftValues = replaceDesktopValues(this.draftValues, null)
        this.desktopAvailable = false
        this.dispatchChanged()
    }

    loadProjectConfig(projectConfig: Partial<ProjectConfig> | null) {
        this.requireInitialized()
        let nextValues = this.values
        for (const key of PROJECT_KEYS) {
            nextValues = { ...nextValues, [key]: requireConfigEntry(key).defaultValue }
        }

        if (projectConfig && projectConfig.cardSeparator === undefined) {
            nextValues = mergeValue(nextValues, 'project.cardSeparator', LEGACY_CARD_SEPARATOR)
        }

        if (projectConfig?.workingFolder !== undefined) nextValues = mergeValue(nextValues, 'project.workingFolder', projectConfig.workingFolder)
        if (projectConfig?.actionsFolder !== undefined) nextValues = mergeValue(nextValues, 'project.actionsFolder', projectConfig.actionsFolder)
        if (projectConfig?.archivedFolder !== undefined) {
            nextValues = mergeValue(nextValues, 'project.archivedFolder', projectConfig.archivedFolder)
        }
        if (projectConfig?.backgroundShade !== undefined) {
            nextValues = mergeValue(nextValues, 'project.backgroundShade', projectConfig.backgroundShade)
        }
        if (projectConfig?.projectFolder !== undefined) nextValues = mergeValue(nextValues, 'project.projectFolder', projectConfig.projectFolder)
        if (projectConfig?.diffCommand !== undefined) nextValues = mergeValue(nextValues, 'project.diffCommand', projectConfig.diffCommand)
        if (projectConfig?.diagramFooter !== undefined) nextValues = mergeValue(nextValues, 'project.diagramFooter', projectConfig.diagramFooter)
        if (projectConfig?.diagramsFolder !== undefined) {
            nextValues = mergeValue(nextValues, 'project.diagramsFolder', projectConfig.diagramsFolder)
        }
        if (projectConfig?.pushMode !== undefined) nextValues = mergeValue(nextValues, 'project.pushMode', projectConfig.pushMode)
        if (projectConfig?.releasesFolder !== undefined) {
            nextValues = mergeValue(nextValues, 'project.releasesFolder', projectConfig.releasesFolder)
        }
        if (projectConfig?.cardSeparator !== undefined) {
            nextValues = mergeValue(nextValues, 'project.cardSeparator', projectConfig.cardSeparator)
        }
        if (projectConfig?.cardTypes !== undefined) nextValues = mergeValue(nextValues, 'project.cardTypes', projectConfig.cardTypes)
        if (projectConfig?.states !== undefined) nextValues = mergeValue(nextValues, 'project.states', projectConfig.states)

        validateProjectFolderPaths(nextValues)
        this.values = nextValues
        this.projectLoaded = true
        this.dispatchChanged()
    }

    getProjectConfig(): ProjectConfig {
        this.requireInitialized()

        return readProjectConfig(this.values)
    }

    getDesktopValues(): DesktopConfigValues {
        this.requireInitialized()

        return readDesktopConfig(this.values)
    }

    getDraftDesktopValues(): DesktopConfigValues {
        return readDesktopConfig(this.requireDraft())
    }

    loadDraft() {
        this.requireInitialized()
        this.draftValues = { ...this.values }
        this.dispatchChanged()

        return this.requireDraft()
    }

    getDraft(): ConfigValues | null {
        return this.draftValues
    }

    setDraftValue(key: ConfigKey, value: unknown) {
        const draft = this.requireDraft()
        this.draftValues = mergeValue(draft, key, value)
        this.dispatchChanged()
    }

    hasDraftChangesForSource(source: ConfigSource) {
        const draft = this.requireDraft()

        return CONFIG_ENTRIES.some((entry) => entry.source === source && !isConfigValueEqual(draft[entry.key], this.values[entry.key]))
    }

    saveDraft() {
        const draft = this.requireDraft()
        for (const key of PROJECT_KEYS) validateValue(key, draft[key])
        validateProjectFolderPaths(draft)
        this.values = draft
        this.draftValues = null
        writeStoredReactValues(this.values)
        this.dispatchChanged()

        return this.values
    }

    discardDraft() {
        this.draftValues = null
        this.dispatchChanged()
    }

    hasProjectConfig() {
        return this.projectLoaded
    }

    hasDesktopConfig() {
        return this.desktopAvailable
    }

    isInitialized() {
        return this.initialized
    }

    private requireDraft() {
        if (!this.draftValues) throw new Error('Config draft is not loaded')

        return this.draftValues
    }

    private requireInitialized() {
        if (!this.initialized) throw new Error('Config service is not initialized')
    }

    private dispatchChanged() {
        this.dispatchEvent(new CustomEvent('changed'))
    }
}

export const configService = new ConfigService()
