import {
    defaultColumnAccent,
    type CardTypeConfig,
    type ProjectConfig,
    type StateConfig,
} from '../../data/data_types'
import { LEGACY_CARD_SEPARATOR } from '../../data/card_identifiers'
import { validateAgentProfiles, validateThinkingLevel, type AgentProfile } from '../../data/agent_profiles'
import {
    CONFIG_ENTRIES,
    createDefaultValues,
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
import { register } from '.././service_injector'

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
    const normalized = value.replace(/\\/gu, '/').replace(/^\/+|\/+$/gu, '')
    if (!allowEmpty && normalized.length === 0) throw new Error(`Missing config field: ${fieldName}`)
    if (/^[a-zA-Z]:/u.test(value) || value.startsWith('/') || value.startsWith('\\')) {
        throw new Error(`Config path ${fieldName} must be repository-relative`)
    }
    if (normalized.split('/').includes('..')) throw new Error(`Config path ${fieldName} must stay inside the project folder`)

    return normalized
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
            state: requireString(item.state, `project.states[${index}].state`),
        }
    })
    const uniqueStates = new Set(states.map(({ state }) => state))
    if (uniqueStates.size !== states.length) throw new Error('Config field project.states contains duplicate states')

    return states
}

function validateDesktopAgentProfiles(value: unknown): AgentProfile[] {
    return validateAgentProfiles(value)
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
        if (entry.min !== undefined && numberValue < entry.min) throw new Error(`Config value ${entry.key} is below ${entry.min}`)
        if (entry.max !== undefined && numberValue > entry.max) throw new Error(`Config value ${entry.key} is above ${entry.max}`)

        return numberValue as ConfigValueTypes[K]
    }
    if (entry.type === 'json' && key === 'project.cardTypes') return validateCardTypes(value) as ConfigValueTypes[K]
    if (entry.type === 'json' && key === 'project.states') return validateStates(value) as ConfigValueTypes[K]
    if (entry.type === 'json' && key === 'desktop.agentProfiles') return validateDesktopAgentProfiles(value) as ConfigValueTypes[K]
    if (key === 'project.projectFolder') {
        if (typeof value !== 'string') throw new Error(`Missing config field: ${entry.key}`)

        return normalizeConfigPath(value, entry.key, true) as ConfigValueTypes[K]
    }
    if (key === 'project.workingFolder' || key === 'project.actionsFolder') {
        return normalizeConfigPath(requireString(value, entry.key), entry.key) as ConfigValueTypes[K]
    }
    if (key === 'desktop.model') {
        if (typeof value !== 'string') throw new Error(`Missing config field: ${entry.key}`)

        return value as ConfigValueTypes[K]
    }
    if (key === 'desktop.thinkingLevel') return validateThinkingLevel(value, entry.key) as ConfigValueTypes[K]

    return validateOption(requireString(value, entry.key), entry) as ConfigValueTypes[K]
}

function mergeValue<K extends ConfigKey>(values: ConfigValues, key: K, value: unknown): ConfigValues {
    return { ...values, [key]: validateValue(key, value) }
}

function readProjectConfig(values: ConfigValues): ProjectConfig {
    return {
        actionsFolder: values['project.actionsFolder'],
        backgroundShade: values['project.backgroundShade'],
        cardBodyTemplate: values['project.cardBodyTemplate'],
        cardSeparator: values['project.cardSeparator'],
        cardTypes: values['project.cardTypes'],
        diffCommand: values['project.diffCommand'],
        projectFolder: values['project.projectFolder'],
        pushMode: values['project.pushMode'],
        states: values['project.states'],
        workingFolder: values['project.workingFolder'],
    }
}

function isConfigValueEqual(first: ConfigValue, second: ConfigValue) {
    if (Object.is(first, second)) return true

    return JSON.stringify(first) === JSON.stringify(second)
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

        if (desktopConfig?.agent !== undefined) nextValues = mergeValue(nextValues, 'desktop.agent', desktopConfig.agent)
        if (desktopConfig?.agentProfiles !== undefined) nextValues = mergeValue(nextValues, 'desktop.agentProfiles', desktopConfig.agentProfiles)
        if (desktopConfig?.codexSearchEnabled !== undefined) {
            nextValues = mergeValue(nextValues, 'desktop.codexSearchEnabled', desktopConfig.codexSearchEnabled)
        }
        if (desktopConfig?.model !== undefined) nextValues = mergeValue(nextValues, 'desktop.model', desktopConfig.model)
        if (desktopConfig?.thinkingLevel !== undefined) {
            nextValues = mergeValue(nextValues, 'desktop.thinkingLevel', desktopConfig.thinkingLevel)
        }

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

    clear() {
        this.values = createDefaultValues()
        this.draftValues = null
        this.desktopAvailable = false
        this.projectLoaded = false
        this.initialized = false
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
        if (projectConfig?.backgroundShade !== undefined) {
            nextValues = mergeValue(nextValues, 'project.backgroundShade', projectConfig.backgroundShade)
        }
        if (projectConfig?.projectFolder !== undefined) nextValues = mergeValue(nextValues, 'project.projectFolder', projectConfig.projectFolder)
        if (projectConfig?.diffCommand !== undefined) nextValues = mergeValue(nextValues, 'project.diffCommand', projectConfig.diffCommand)
        if (projectConfig?.pushMode !== undefined) nextValues = mergeValue(nextValues, 'project.pushMode', projectConfig.pushMode)
        if (projectConfig?.cardBodyTemplate !== undefined) {
            nextValues = mergeValue(nextValues, 'project.cardBodyTemplate', projectConfig.cardBodyTemplate)
        }
        if (projectConfig?.cardSeparator !== undefined) {
            nextValues = mergeValue(nextValues, 'project.cardSeparator', projectConfig.cardSeparator)
        }
        if (projectConfig?.cardTypes !== undefined) nextValues = mergeValue(nextValues, 'project.cardTypes', projectConfig.cardTypes)
        if (projectConfig?.states !== undefined) nextValues = mergeValue(nextValues, 'project.states', projectConfig.states)

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

        return {
            agent: this.values['desktop.agent'],
            agentProfiles: this.values['desktop.agentProfiles'],
            codexSearchEnabled: this.values['desktop.codexSearchEnabled'],
            model: this.values['desktop.model'],
            thinkingLevel: this.values['desktop.thinkingLevel'],
        }
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
