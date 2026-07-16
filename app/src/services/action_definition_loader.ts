import {
    parseActionDefinitionFiles,
    validateActionDefinitionGraph as validateSharedActionDefinitionGraph,
} from '../../../shared/action_definitions.mjs'
import {
    loadTolerantActionDefinitionGraph as loadSharedTolerantActionDefinitionGraph,
} from '../../../shared/tolerant_action_definitions.mjs'
import type { ActionDefinitionLoadIssue } from '../../../shared/tolerant_action_definitions.mjs'
import type {
    ActionDefinition,
    ActionDefinitionEntry,
    ActionFile,
    RawActionDefinitionEntry,
} from '../data/action_types'
import type { AgentProfile } from '../data/agent_profiles'
import { configService } from './config_service'

interface ActionDefinitionLoaderDependencies {
    profiles?: AgentProfile[]
    validateAgentCapabilities?: boolean
}

export type { ActionDefinitionLoadIssue }

function defaultLoaderDependencies(): ActionDefinitionLoaderDependencies {
    if (!configService.isInitialized()) return {}

    return {profiles: configService.get('desktop.agentProfiles')}
}

/**
 * Load and validate action definitions from raw json files. Always includes the built-in
 * `custom prompt` action.
 */
export function loadActionDefinitions(
    files: ActionFile[],
    dependencies: ActionDefinitionLoaderDependencies = defaultLoaderDependencies(),
): ActionDefinition[] {
    return loadActionDefinitionGraph(files, dependencies).actions
}

export function loadActionDefinitionGraph(
    files: ActionFile[],
    dependencies: ActionDefinitionLoaderDependencies = defaultLoaderDependencies(),
): { actions: ActionDefinition[], definitions: RawActionDefinitionEntry[] } {
    const definitions = parseActionDefinitionFiles(files)
    const actions = validateSharedActionDefinitionGraph(definitions, dependencies)

    return { actions, definitions: definitions as RawActionDefinitionEntry[] }
}

/** Load every usable action while collecting file-level problems for deferred reporting. */
export function loadTolerantActionDefinitionGraph(
    files: ActionFile[],
    dependencies: ActionDefinitionLoaderDependencies = defaultLoaderDependencies(),
): { actions: ActionDefinition[], definitions: RawActionDefinitionEntry[], issues: ActionDefinitionLoadIssue[] } {
    return loadSharedTolerantActionDefinitionGraph(files, dependencies)
}

export function validateActionDefinitionGraph(
    definitions: ActionDefinitionEntry[],
    dependencies: ActionDefinitionLoaderDependencies = defaultLoaderDependencies(),
): ActionDefinition[] {
    return validateSharedActionDefinitionGraph(definitions, dependencies)
}
