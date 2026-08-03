import {
    DEFAULT_ACTIONS_FOLDER,
    DEFAULT_ARCHIVED_FOLDER,
    DEFAULT_CARD_BODY_TEMPLATE,
    DEFAULT_CARD_TYPES,
    DEFAULT_DIFF_COMMAND,
    DEFAULT_PROJECT_FOLDER,
    DEFAULT_RELEASES_FOLDER,
    DEFAULT_STATES,
    DEFAULT_WORKING_FOLDER,
    type CardTypeConfig,
    type PushMode,
    type StateConfig,
} from '../../data/data_types'
import { BUILTIN_AGENT_PROFILES, type AgentProfile, type ThinkingLevel } from '../../data/agent_profiles'
import type { ProjectBackgroundShade } from '../../theme/project_background_shade'
import { DEFAULT_CARD_SEPARATOR, type CardSeparator } from '../../data/card_identifiers'

export type ConfigSource = 'react' | 'desktop' | 'project'
export type ConfigValueType = 'boolean' | 'number' | 'select' | 'string' | 'json'

export interface ConfigValueTypes {
    'desktop.accessLevel': string
    'desktop.agent': string
    'desktop.agentProfiles': AgentProfile[]
    'desktop.approvalPolicy': string
    'desktop.codexSearchEnabled': boolean
    'desktop.model': string
    'desktop.thinkingLevel': ThinkingLevel
    'project.actionsFolder': string
    'project.archivedFolder': string
    'project.backgroundShade': ProjectBackgroundShade
    'project.cardBodyTemplate': string
    'project.cardSeparator': CardSeparator
    'project.cardTypes': CardTypeConfig[]
    'project.diffCommand': string
    'project.projectFolder': string
    'project.pushMode': PushMode
    'project.releasesFolder': string
    'project.states': StateConfig[]
    'project.workingFolder': string
    'react.autoCommitDelayMs': number
    'react.showStartupSplash': boolean
}

export type ConfigKey = keyof ConfigValueTypes

export type ConfigValue = boolean | number | string | AgentProfile[] | CardTypeConfig[] | StateConfig[]

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
    accessLevel?: string
    agent: string
    agentProfiles: AgentProfile[]
    approvalPolicy?: string
    codexSearchEnabled?: boolean
    model: string
    thinkingLevel?: ThinkingLevel
}

export const CONFIG_SECTIONS = [
    { id: 'react', label: 'React app' },
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
        defaultValue: DEFAULT_PROJECT_FOLDER,
        description: 'Project root folder containing actions, releases, archives, and the working folder. Leave empty to use the repository root.',
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
        defaultValue: DEFAULT_RELEASES_FOLDER,
        description: 'Folder inside the project folder that contains one subfolder per completed release.',
        editable: true,
        key: 'project.releasesFolder',
        label: 'Releases folder',
        section: 'project',
        source: 'project',
        type: 'string',
    },
    {
        defaultValue: DEFAULT_ARCHIVED_FOLDER,
        description: 'Folder inside the project folder that contains individually archived cards.',
        editable: true,
        key: 'project.archivedFolder',
        label: 'Archived folder',
        section: 'project',
        source: 'project',
        type: 'string',
    },
    {
        defaultValue: 'neutral',
        description: 'Subtle background tint used to distinguish this project from other open app instances.',
        editable: true,
        key: 'project.backgroundShade',
        label: 'Background shade',
        options: [
            { label: 'Neutral', value: 'neutral' },
            { label: 'Blue', value: 'blue' },
            { label: 'Green', value: 'green' },
            { label: 'Red', value: 'red' },
            { label: 'Purple', value: 'purple' },
            { label: 'Amber', value: 'amber' },
        ],
        section: 'project',
        source: 'project',
        type: 'select',
    },
    {
        defaultValue: DEFAULT_DIFF_COMMAND,
        description: 'Command template used to render a commit diff. Placeholders: {{worktree-folder}}, {{project-folder}}, {{releases-folder}}, {{commit}}, {{branch}}, {{file}}.',
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
        defaultValue: DEFAULT_CARD_SEPARATOR,
        description: 'Character used between the card ID prefix, number, and title in generated card file names.',
        editable: true,
        key: 'project.cardSeparator',
        label: 'Card separator',
        options: [
            { label: 'Underscore (_)', value: '_' },
            { label: 'Hyphen (-)', value: '-' },
        ],
        section: 'project',
        source: 'project',
        type: 'select',
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
        defaultValue: DEFAULT_STATES,
        description: 'Board columns in display order. Fields: state, alwaysVisible, color.',
        editable: true,
        key: 'project.states',
        label: 'Columns',
        section: 'project',
        source: 'project',
        type: 'json',
    },
    {
        defaultValue: 'workspace-write',
        description: 'Default access level for desktop agent actions.',
        editable: true,
        key: 'desktop.accessLevel',
        label: 'Default access level',
        section: 'desktop',
        source: 'desktop',
        type: 'string',
    },
    {
        defaultValue: 'on-request',
        description: 'Default approval policy for desktop agent actions.',
        editable: true,
        key: 'desktop.approvalPolicy',
        label: 'Default approval policy',
        section: 'desktop',
        source: 'desktop',
        type: 'string',
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
        defaultValue: true,
        description: 'Allow Codex desktop actions to use live web search.',
        editable: true,
        key: 'desktop.codexSearchEnabled',
        label: 'Codex web search',
        section: 'desktop',
        source: 'desktop',
        type: 'boolean',
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
        defaultValue: 'none',
        description: 'Default reasoning level for desktop agent actions.',
        editable: true,
        key: 'desktop.thinkingLevel',
        label: 'Default reasoning level',
        options: [
            { label: 'none', value: 'none' },
            { label: 'low', value: 'low' },
            { label: 'medium', value: 'medium' },
            { label: 'high', value: 'high' },
            { label: 'max', value: 'max' },
        ],
        section: 'desktop',
        source: 'desktop',
        type: 'select',
    },
    {
        defaultValue: BUILTIN_AGENT_PROFILES,
        description: 'Agent profiles. command and resumeCommand are string arrays. Custom command may include {{model}}; resumeCommand may include {{sessionId}}.',
        editable: true,
        key: 'desktop.agentProfiles',
        label: 'Agent profiles',
        section: 'desktop',
        source: 'desktop',
        type: 'json',
    },
]

const CONFIG_ENTRY_BY_KEY = new Map(CONFIG_ENTRIES.map((entry) => [entry.key, entry]))

export const PROJECT_KEYS: ConfigKey[] = [
    'project.projectFolder',
    'project.workingFolder',
    'project.actionsFolder',
    'project.releasesFolder',
    'project.archivedFolder',
    'project.backgroundShade',
    'project.diffCommand',
    'project.pushMode',
    'project.cardBodyTemplate',
    'project.cardSeparator',
    'project.cardTypes',
    'project.states',
]

export const LOCAL_STORAGE_KEYS: ConfigKey[] = CONFIG_ENTRIES.filter(
    (entry) => entry.source === 'react',
).map((entry) => entry.key)

export function createDefaultValues(): ConfigValues {
    return CONFIG_ENTRIES.reduce((values, entry) => ({ ...values, [entry.key]: entry.defaultValue }), {} as ConfigValues)
}

export function requireConfigEntry(key: ConfigKey) {
    const entry = CONFIG_ENTRY_BY_KEY.get(key)
    if (!entry) throw new Error(`Unknown config key: ${key}`)

    return entry
}
