import {
    DEFAULT_ACTIONS_FOLDER,
    DEFAULT_CARD_BODY_TEMPLATE,
    DEFAULT_CARD_TYPES,
    DEFAULT_DIFF_COMMAND,
    DEFAULT_PROJECT_FOLDER,
    DEFAULT_WORKING_FOLDER,
    type CardTypeConfig,
    type PushMode,
} from '../data/data_types'
import { BUILTIN_AGENT_PROFILES, type AgentProfile } from '../data/agent_profiles'

export type ConfigSource = 'react' | 'connection' | 'desktop' | 'project'
export type ConfigValueType = 'boolean' | 'number' | 'select' | 'string' | 'json'

export interface ConfigValueTypes {
    'connection.githubScopes': string
    'desktop.agent': string
    'desktop.agentSlotCommand': string
    'desktop.agentProfiles': AgentProfile[]
    'desktop.model': string
    'desktop.projectLocationMode': string
    'project.actionsFolder': string
    'project.cardBodyTemplate': string
    'project.cardTypes': CardTypeConfig[]
    'project.diffCommand': string
    'project.projectFolder': string
    'project.pushMode': PushMode
    'project.workingFolder': string
    'react.autoCommitDelayMs': number
    'react.showStartupSplash': boolean
}

export type ConfigKey = keyof ConfigValueTypes

export type ConfigValue = boolean | number | string | AgentProfile[] | CardTypeConfig[]

export interface ConfigOption {
    label: string
    value: string
}

export interface ConfigEntry {
    defaultValue: ConfigValue
    description: string
    editable: boolean
    input?: 'slider'
    key: ConfigKey
    label: string
    max?: number
    min?: number
    options?: ConfigOption[]
    section: string
    source: ConfigSource
    step?: number
    type: ConfigValueType
}

export type ConfigValues = ConfigValueTypes

export interface DesktopConfigValues {
    agent: string
    agentSlotCommand: string
    agentProfiles: AgentProfile[]
    model: string
    projectLocationMode: string
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
        input: 'slider',
        max: MAX_AUTO_COMMIT_DELAY_MS,
        min: MIN_AUTO_COMMIT_DELAY_MS,
        section: 'react',
        source: 'react',
        step: 1000,
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
        defaultValue: DEFAULT_PROJECT_FOLDER,
        description: 'Project root folder containing actions, history, and the working folder. Leave empty to use the repository root.',
        editable: true,
        key: 'project.projectFolder',
        label: 'Project folder',
        section: 'project',
        source: 'project',
        type: 'string',
    },
    {
        defaultValue: DEFAULT_WORKING_FOLDER,
        description: 'Folder inside the project folder that contains active design and job markdown files.',
        editable: true,
        key: 'project.workingFolder',
        label: 'Working folder',
        section: 'project',
        source: 'project',
        type: 'string',
    },
    {
        defaultValue: DEFAULT_ACTIONS_FOLDER,
        description: 'Folder inside the project folder that contains the project action json definitions.',
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
        description: 'Default local agent profile used by desktop actions.',
        editable: true,
        key: 'desktop.agent',
        label: 'Default agent',
        section: 'desktop',
        source: 'desktop',
        type: 'string',
    },
    {
        defaultValue: '',
        description: 'Command that outputs the next agent-slot timestamp for scheduled actions.',
        editable: true,
        key: 'desktop.agentSlotCommand',
        label: 'Agent slot command',
        section: 'desktop',
        source: 'desktop',
        type: 'string',
    },
    {
        defaultValue: '',
        description: 'Default model for the selected desktop agent profile. Leave empty for the profile default.',
        editable: true,
        key: 'desktop.model',
        label: 'Default model',
        section: 'desktop',
        source: 'desktop',
        type: 'string',
    },
    {
        defaultValue: BUILTIN_AGENT_PROFILES,
        description: 'Agent profiles. Fields: name, command, modelArgument, models, defaultModel, resumeCommand, sessionIdPattern. Custom command may include {{model}}; resumeCommand may include {{sessionId}}.',
        editable: true,
        key: 'desktop.agentProfiles',
        label: 'Agent profiles',
        section: 'desktop',
        source: 'desktop',
        type: 'json',
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

export const PROJECT_KEYS: ConfigKey[] = [
    'project.projectFolder',
    'project.workingFolder',
    'project.actionsFolder',
    'project.diffCommand',
    'project.pushMode',
    'project.cardBodyTemplate',
    'project.cardTypes',
]

export const LOCAL_STORAGE_KEYS: ConfigKey[] = CONFIG_ENTRIES.filter(
    (entry) => entry.source === 'react' || entry.source === 'connection',
).map((entry) => entry.key)

export function createDefaultValues(): ConfigValues {
    return CONFIG_ENTRIES.reduce((values, entry) => ({ ...values, [entry.key]: entry.defaultValue }), {} as ConfigValues)
}

export function requireConfigEntry(key: ConfigKey) {
    const entry = CONFIG_ENTRY_BY_KEY.get(key)
    if (!entry) throw new Error(`Unknown config key: ${key}`)

    return entry
}
