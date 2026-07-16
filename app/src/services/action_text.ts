import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type { ProjectReference } from '../data/data_types'

const PLACEHOLDER_PATTERN = /\{\{\s*(rootProjectFolder|card-file|card-prompt)\s*\}\}/gu
const CARD_PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*card-prompt\s*\}\}/u

export function resolvePlaceholders(text: string, context: ActionContext, project: ProjectReference, extraPrompt: string): string {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
        if (name === 'rootProjectFolder') {
            if (!project.rootPath) throw new Error('Cannot resolve rootProjectFolder without a local project rootPath')

            return project.rootPath
        }

        if (name === 'card-prompt') return extraPrompt

        if (!context.file) throw new Error('Cannot resolve card-file placeholder without a file context')

        return context.file
    })
}

export function resolveAgentPrompt(
    action: ActionDefinition,
    context: ActionContext,
    project: ProjectReference,
    extraPrompt: string,
): string {
    if (!action.prompt) throw new Error(`Missing prompt for agent action "${action.label}"`)
    const resolvedText = resolvePlaceholders(action.prompt, context, project, extraPrompt)
    if (CARD_PROMPT_PLACEHOLDER_PATTERN.test(action.prompt)) return resolvedText
    if (extraPrompt.trim().length === 0) return resolvedText

    return `${resolvedText}\n\n${extraPrompt}`
}
