import {
    parseActionDefinitionFiles,
    validateActionDefinition as validateSharedActionDefinition,
    validateActionDefinitionGraph as validateSharedActionDefinitionGraph,
} from '../../../../shared/action_definitions.mjs'
import {
    loadTolerantActionDefinitionGraph as loadSharedTolerantActionDefinitionGraph,
} from '../../../../shared/tolerant_action_definitions.mjs'
import type { ActionDefinitionLoadIssue } from '../../../../shared/tolerant_action_definitions.mjs'
import type {
    ActionDefinition,
    ActionDefinitionEntry,
    ActionFile,
    RawActionDefinition,
    RawActionDefinitionEntry,
} from '../../data/action_types'
import type { AgentProfile } from '../../data/agent_profiles'
import { configService } from '../config/config_service'

interface ActionDefinitionLoaderDependencies {
    profiles?: AgentProfile[]
    states?: string[]
    validateAgentCapabilities?: boolean
}

export type { ActionDefinitionLoadIssue }

function defaultLoaderDependencies(): ActionDefinitionLoaderDependencies {
    if (!configService.isInitialized()) return {}

    return {
        profiles: configService.get('desktop.agentProfiles'),
        states: configService.getProjectConfig().states.map(({ state }) => state),
    }
}

function resolvedLoaderDependencies(dependencies?: ActionDefinitionLoaderDependencies) {
    return { ...defaultLoaderDependencies(), ...dependencies }
}

/**
 * Load and validate action definitions from raw json files. Always includes the built-in
 * `custom prompt` action.
 */
export function loadActionDefinitions(
    files: ActionFile[],
    dependencies?: ActionDefinitionLoaderDependencies,
): ActionDefinition[] {
    return loadActionDefinitionGraph(files, dependencies).actions
}

export function loadActionDefinitionGraph(
    files: ActionFile[],
    dependencies?: ActionDefinitionLoaderDependencies,
): { actions: ActionDefinition[], definitions: RawActionDefinitionEntry[] } {
    const definitions = parseActionDefinitionFiles(files)
    const actions = validateSharedActionDefinitionGraph(definitions, resolvedLoaderDependencies(dependencies))

    return { actions, definitions: definitions as RawActionDefinitionEntry[] }
}

/** Load every usable action while collecting file-level problems for deferred reporting. */
export function loadTolerantActionDefinitionGraph(
    files: ActionFile[],
    dependencies?: ActionDefinitionLoaderDependencies,
): { actions: ActionDefinition[], definitions: RawActionDefinitionEntry[], issues: ActionDefinitionLoadIssue[] } {
    return loadSharedTolerantActionDefinitionGraph(files, resolvedLoaderDependencies(dependencies))
}

export function validateActionDefinitionGraph(
    definitions: ActionDefinitionEntry[],
    dependencies?: ActionDefinitionLoaderDependencies,
): ActionDefinition[] {
    return validateSharedActionDefinitionGraph(definitions, resolvedLoaderDependencies(dependencies))
}

/** Validate one structured definition without resolving the complete action graph. */
export function validateActionDefinition(
    definition: RawActionDefinition,
    path: string,
    dependencies?: ActionDefinitionLoaderDependencies,
) {
    return validateSharedActionDefinition(definition, path, resolvedLoaderDependencies(dependencies))
}
