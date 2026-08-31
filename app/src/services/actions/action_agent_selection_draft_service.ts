import type { RawActionDefinition } from '../../data/action_types'
import type { AgentProfile } from '../../data/agent_profiles'
import { THINKING_LEVELS, type ThinkingLevel } from '../../data/agent_profiles'
import {
    resolveAgentSelectionState,
    type AgentSelectionState,
} from '../../data/agent_selection'
import { register } from '../service_injector'

/** Owns per-agent selection memory while action-definition drafts are open. */
export class ActionAgentSelectionDraftService {
    private readonly selections = new Map<string, AgentSelectionState>()

    constructor() {
        register('actionAgentSelectionDraftService', this)
    }

    getSelection(
        sourcePath: string,
        definition: RawActionDefinition,
        desktopSelection: AgentSelectionState,
        profiles: AgentProfile[],
    ) {
        const current = this.selections.get(sourcePath)
        if (current) return current

        const activeAgent = definition.agent ?? desktopSelection.activeAgent
        const definitionThinkingLevel = THINKING_LEVELS.includes(definition.thinkingLevel as ThinkingLevel)
            ? definition.thinkingLevel as ThinkingLevel
            : 'none'
        const definitionSettings = definition.agent && definition.model
            ? {
                [definition.agent]: {
                    model: definition.model,
                    thinkingLevel: definitionThinkingLevel,
                },
            }
            : {}
        const selection = resolveAgentSelectionState({
            activeAgent,
            permissionMode: definition.permissionMode ?? desktopSelection.permissionMode,
            settingsByAgent: { ...desktopSelection.settingsByAgent, ...definitionSettings },
        }, profiles, [desktopSelection])
        this.selections.set(sourcePath, selection)

        return selection
    }

    setSelection(sourcePath: string, selection: AgentSelectionState) {
        this.selections.set(sourcePath, selection)
    }

    clearSelection(sourcePath: string) {
        this.selections.delete(sourcePath)
    }

    clear() {
        this.selections.clear()
    }
}

export const actionAgentSelectionDraftService = new ActionAgentSelectionDraftService()
