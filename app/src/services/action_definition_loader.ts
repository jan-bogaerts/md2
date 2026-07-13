import { loadActionDefinitions as loadSharedActionDefinitions } from '../../../shared/action_definitions.mjs'
import type { ActionDefinition, ActionFile } from '../data/action_types'
import type { AgentProfile } from '../data/agent_profiles'
import { configService } from './config_service'

interface ActionDefinitionLoaderDependencies {
    profiles?: AgentProfile[]
}

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
    return loadSharedActionDefinitions(files, dependencies)
}
