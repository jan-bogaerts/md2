import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'

const PLACEHOLDER_PATTERN = /\{\{\s*(worktree-folder|project-folder|releases-folder|card-file|card-title|card-prompt)\s*\}\}/gu
const CARD_PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*card-prompt\s*\}\}/u

export interface ActionFolderPlaceholderValues {
    projectFolder: string
    releasesFolder: string
    worktreeFolder: string
}

export function resolvePlaceholders(
    text: string,
    context: ActionContext,
    folders: ActionFolderPlaceholderValues,
    extraPrompt: string,
): string {
    return text.replace(PLACEHOLDER_PATTERN, (_match, name: string) => {
        if (name === 'worktree-folder') {
            if (!folders.worktreeFolder) throw new Error('Cannot resolve worktree-folder without a run checkout path')

            return folders.worktreeFolder
        }
        if (name === 'project-folder') {
            if (!folders.projectFolder) throw new Error('Cannot resolve project-folder without an opened repository path')

            return folders.projectFolder
        }
        if (name === 'releases-folder') {
            if (!folders.releasesFolder) throw new Error('Cannot resolve releases-folder without a configured releases folder')

            return folders.releasesFolder
        }

        if (name === 'card-prompt') return extraPrompt

        if (name === 'card-title') {
            if (!context.title) throw new Error('Cannot resolve card-title placeholder without a card title')

            return context.title
        }

        if (!context.file) throw new Error('Cannot resolve card-file placeholder without a file context')

        return context.file
    })
}

export function resolveAgentPrompt(
    action: ActionDefinition,
    context: ActionContext,
    folders: ActionFolderPlaceholderValues,
    extraPrompt: string,
): string {
    if (!action.prompt) throw new Error(`Missing prompt for agent action "${action.label}"`)
    const resolvedText = resolvePlaceholders(action.prompt, context, folders, extraPrompt)
    if (CARD_PROMPT_PLACEHOLDER_PATTERN.test(action.prompt)) return resolvedText
    if (extraPrompt.trim().length === 0) return resolvedText

    return `${resolvedText}\n\n${extraPrompt}`
}
