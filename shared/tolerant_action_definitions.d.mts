import type {
    ActionDefinition,
    ActionDefinitionLoaderDependencies,
    ActionFile,
    RawActionDefinitionEntry,
} from './action_definitions.mjs'

export interface ActionDefinitionLoadIssue {
    message: string
    path: string
}

export interface TolerantActionDefinitionGraph {
    actions: ActionDefinition[]
    definitions: RawActionDefinitionEntry[]
    issues: ActionDefinitionLoadIssue[]
}

export function loadTolerantActionDefinitionGraph(
    files: ActionFile[],
    dependencies?: ActionDefinitionLoaderDependencies,
): TolerantActionDefinitionGraph

export function loadTolerantActionDefinitions(
    files: ActionFile[],
    dependencies?: ActionDefinitionLoaderDependencies,
): ActionDefinition[]
