import {
    DEFAULT_ACTIONS_FOLDER,
    DEFAULT_CARD_BODY_TEMPLATE,
    DEFAULT_CARD_TYPES,
    DEFAULT_DIFF_COMMAND,
    DEFAULT_WORKING_FOLDER,
    type CardTypeConfig,
    type ProjectConfig,
    type PushMode,
} from '../data/data_types'
import { register } from './service_injector'

export type ConfigSource = 'react' | 'connection' | 'desktop' | 'project'
export type ConfigValueType = 'boolean' | 'number' | 'select' | 'string' | 'json'

export type ConfigKey =
    | 'connection.githubScopes'
    | 'desktop.agent'
    | 'desktop.projectLocationMode'
    | 'project.actionsFolder'
    | 'project.cardBodyTemplate'
    | 'project.cardTypes'
    | 'project.diffCommand'
    | 'project.pushMode'
    | 'project.workingFolder'
    | 'react.autoCommitDelayMs'
    | 'react.showStartupSplash'

export type ConfigValue = boolean | number | string | CardTypeConfig[]

export interface ConfigOption {
    label: string
    value: string
}

export interface ConfigEntry {
    defaultValue: ConfigValue
    description: string
    editable: boolean
    key: ConfigKey
    label: string
    max?: number
    min?: number
    options?: ConfigOption[]
    section: string
    source: ConfigSource
    type: ConfigValueType
}

export type ConfigValues = Record<ConfigKey, ConfigValue>

export interface DesktopConfigValues {
    agent: string
    projectLocationMode: string
}

interface ConfigServiceInitDependencies {
    desktopConfig?: Partial<DesktopConfigValues> | null
}

export const CONFIG_SECTIONS = [
    { id: 'react', label: 'React app' },
    { id: 'connection', label: 'Connection' },
    { id: 'project', label: 'Project' },
    { id: 'desktop', label: 'Desktop' },
]

const DEFAULT_AUTO_COMMIT_DELAY_MS = 30000
const MIN_AUTO_COMMIT_DELAY_MS = 1000
const MAX_AUTO_COMMIT_DELAY_MS = 120000

export const CONFIG_ENTRIES: ConfigEntry[] = [
    {
        defaultValue: true,
        description: 'Show the startup splash while the last project is restored.',
        editable: true,
        key: 'react.showStartupSplash',
        label: 'Startup splash',
        section: 'react',
        source: 'react',
        type: 'boolean',
    },
    {
        defaultValue: DEFAULT_AUTO_COMMIT_DELAY_MS,
        description: 'Delay before editor changes are committed after typing stops.',
        editable: true,
        key: 'react.autoCommitDelayMs',
        label: 'Auto commit delay',
        max: MAX_AUTO_COMMIT_DELAY_MS,
        min: MIN_AUTO_COMMIT_DELAY_MS,
        section: 'react',
        source: 'react',
        type: 'number',
    },
    {
        defaultValue: 'repo',
        description: 'OAuth scopes requested when connecting GitHub.',
        editable: true,
        key: 'connection.githubScopes',
        label: 'GitHub scopes',
        options: [
            { label: 'Repository access', value: 'repo' },
            { label: 'Public repository access', value: 'public_repo' },
        ],
        section: 'connection',
        source: 'connection',
        type: 'select',
    },
    {
        defaultValue: DEFAULT_WORKING_FOLDER,
        description: 'Folder that contains active design and job markdown files.',
        editable: true,
        key: 'project.workingFolder',
        label: 'Working folder',
        section: 'project',
        source: 'project',
        type: 'string',
    },
    {
        defaultValue: DEFAULT_ACTIONS_FOLDER,
        description: 'Folder that contains the project action json definitions.',
        editable: true,
        key: 'project.actionsFolder',
        label: 'Actions folder',
        section: 'project',
        source: 'project',
        type: 'string',
    },
    {
        defaultValue: DEFAULT_DIFF_COMMAND,
        description: 'Command template used to render a commit diff. Placeholders: {{rootProjectFolder}}, {{commit}}, {{branch}}, {{file}}.',
        editable: true,
        key: 'project.diffCommand',
        label: 'Diff command',
        section: 'project',
        source: 'project',
        type: 'string',
    },
    {
        defaultValue: 'auto',
        description: 'Push commits automatically or wait for an explicit push.',
        editable: true,
        key: 'project.pushMode',
        label: 'Push mode',
        options: [
            { label: 'Auto push', value: 'auto' },
            { label: 'Manual push', value: 'manual' },
        ],
        section: 'project',
        source: 'project',
        type: 'select',
    },
    {
        defaultValue: DEFAULT_CARD_BODY_TEMPLATE,
        description: 'Markdown inserted into new cards before the typed body.',
        editable: true,
        key: 'project.cardBodyTemplate',
        label: 'Card body template',
        section: 'project',
        source: 'project',
        type: 'string',
    },
    {
        defaultValue: DEFAULT_CARD_TYPES,
        description: 'Card type metadata used for generated IDs and card colors.',
        editable: true,
        key: 'project.cardTypes',
        label: 'Card types',
        section: 'project',
        source: 'project',
        type: 'json',
    },
    {
        defaultValue: 'codex',
        description: 'Default local agent used by desktop actions.',
        editable: true,
        key: 'desktop.agent',
        label: 'Agent',
        options: [
            { label: 'Codex', value: 'codex' },
            { label: 'System default', value: 'system' },
        ],
        section: 'desktop',
        source: 'desktop',
        type: 'select',
    },
    {
        defaultValue: 'folder',
        description: 'How desktop local projects resolve their Git root.',
        editable: true,
        key: 'desktop.projectLocationMode',
        label: 'Project location',
        options: [
            { label: 'Selected folder', value: 'folder' },
            { label: 'Current directory', value: 'current-directory' },
        ],
        section: 'desktop',
        source: 'desktop',
        type: 'select',
    },
]

const CONFIG_ENTRY_BY_KEY = new Map(CONFIG_ENTRIES.map((entry) => [entry.key, entry]))
const PROJECT_KEYS: ConfigKey[] = [
    'project.workingFolder',
    'project.actionsFolder',
    'project.diffCommand',
    'project.pushMode',
    'project.cardBodyTemplate',
    'project.cardTypes',
]

function createDefaultValues(): ConfigValues {
    return CONFIG_ENTRIES.reduce((values, entry) => ({ ...values, [entry.key]: entry.defaultValue }), {} as ConfigValues)
}

function requireEntry(key: ConfigKey) {
    const entry = CONFIG_ENTRY_BY_KEY.get(key)
    if (!entry) throw new Error(`Unknown config key: ${key}`)

    return entry
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

function validateOption(value: string, entry: ConfigEntry) {
    if (!entry.options) return value
    if (!entry.options.some((option) => option.value === value)) throw new Error(`Invalid config value for ${entry.key}: ${value}`)

    return value
}

function validateValue(key: ConfigKey, value: unknown): ConfigValue {
    const entry = requireEntry(key)

    if (entry.type === 'boolean') return requireBoolean(value, entry.key)
    if (entry.type === 'number') {
        const numberValue = requireNumber(value, entry.key)
        if (entry.min !== undefined && numberValue < entry.min) throw new Error(`Config value ${entry.key} is below ${entry.min}`)
        if (entry.max !== undefined && numberValue > entry.max) throw new Error(`Config value ${entry.key} is above ${entry.max}`)

        return numberValue
    }
    if (entry.type === 'json' && key === 'project.cardTypes') return validateCardTypes(value)

    return validateOption(requireString(value, entry.key), entry)
}

function mergeValue(values: ConfigValues, key: ConfigKey, value: unknown): ConfigValues {
    return { ...values, [key]: validateValue(key, value) }
}

function readProjectConfig(values: ConfigValues): ProjectConfig {
    return {
        actionsFolder: values['project.actionsFolder'] as string,
        cardBodyTemplate: values['project.cardBodyTemplate'] as string,
        cardTypes: values['project.cardTypes'] as CardTypeConfig[],
        diffCommand: values['project.diffCommand'] as string,
        pushMode: values['project.pushMode'] as PushMode,
        workingFolder: values['project.workingFolder'] as string,
    }
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

        if (desktopConfig?.agent !== undefined) nextValues = mergeValue(nextValues, 'desktop.agent', desktopConfig.agent)
        if (desktopConfig?.projectLocationMode !== undefined) {
            nextValues = mergeValue(nextValues, 'desktop.projectLocationMode', desktopConfig.projectLocationMode)
        }

        this.initialized = true
        this.values = nextValues
        this.dispatchChanged()
    }

    getEntries(): ConfigEntry[] {
        this.requireInitialized()

        return CONFIG_ENTRIES.filter((entry) => {
            if (entry.source === 'desktop') return this.desktopAvailable
            if (entry.source === 'project') return this.projectLoaded

            return true
        })
    }

    get(key: ConfigKey): ConfigValue {
        this.requireInitialized()

        return this.values[key]
    }

    set(key: ConfigKey, value: unknown) {
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
            nextValues = { ...nextValues, [key]: requireEntry(key).defaultValue }
        }

        if (projectConfig?.workingFolder !== undefined) nextValues = mergeValue(nextValues, 'project.workingFolder', projectConfig.workingFolder)
        if (projectConfig?.actionsFolder !== undefined) nextValues = mergeValue(nextValues, 'project.actionsFolder', projectConfig.actionsFolder)
        if (projectConfig?.diffCommand !== undefined) nextValues = mergeValue(nextValues, 'project.diffCommand', projectConfig.diffCommand)
        if (projectConfig?.pushMode !== undefined) nextValues = mergeValue(nextValues, 'project.pushMode', projectConfig.pushMode)
        if (projectConfig?.cardBodyTemplate !== undefined) {
            nextValues = mergeValue(nextValues, 'project.cardBodyTemplate', projectConfig.cardBodyTemplate)
        }
        if (projectConfig?.cardTypes !== undefined) nextValues = mergeValue(nextValues, 'project.cardTypes', projectConfig.cardTypes)

        this.values = nextValues
        this.projectLoaded = true
        this.dispatchChanged()
    }

    getProjectConfig(): ProjectConfig {
        this.requireInitialized()

        return readProjectConfig(this.values)
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

    saveDraft() {
        const draft = this.requireDraft()
        for (const key of PROJECT_KEYS) validateValue(key, draft[key])
        this.values = draft
        this.draftValues = null
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
