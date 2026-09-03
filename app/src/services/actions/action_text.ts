import type { ActionContext } from '../../data/action_context'
import type { ActionDefinition } from '../../data/action_types'

const FOLDER_PLACEHOLDER_NAMES = 'active-cards-folder|worktree-folder|repository-folder|project-folder|releases-folder'
const CARD_PLACEHOLDER_NAMES = 'card-file|card-title|card-prompt'
const CONFLICT_PLACEHOLDER_NAMES = 'conflict-file|conflict-files'
const DIAGRAM_PLACEHOLDER_NAMES = 'diagram-file|parent-node'
const PLACEHOLDER_PATTERN = new RegExp(`\\{\\{\\s*(${FOLDER_PLACEHOLDER_NAMES}|${CARD_PLACEHOLDER_NAMES}|${CONFLICT_PLACEHOLDER_NAMES}|${DIAGRAM_PLACEHOLDER_NAMES})\\s*\\}\\}`, 'gu')
const CARD_PROMPT_PLACEHOLDER_PATTERN = /\{\{\s*card-prompt\s*\}\}/u

export interface ActionFolderPlaceholderValues {
    activeCardsFolder: string
    diagramFile?: string
    projectFolder: string
    repositoryFolder: string
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
        if (name === 'active-cards-folder') {
            if (!folders.activeCardsFolder) throw new Error('Cannot resolve active-cards-folder without a configured working folder')

            return folders.activeCardsFolder
        }
        if (name === 'worktree-folder') {
            if (!folders.worktreeFolder) throw new Error('Cannot resolve worktree-folder without a run checkout path')

            return folders.worktreeFolder
        }
        if (name === 'repository-folder') {
            if (!folders.repositoryFolder) throw new Error('Cannot resolve repository-folder without an opened repository path')

            return folders.repositoryFolder
        }
        if (name === 'project-folder') {
            if (!folders.projectFolder) throw new Error('Cannot resolve project-folder without a configured project path')

            return folders.projectFolder
        }
        if (name === 'releases-folder') {
            if (!folders.releasesFolder) throw new Error('Cannot resolve releases-folder without a configured releases folder')

            return folders.releasesFolder
        }

        if (name === 'card-prompt') return extraPrompt
        if (name === 'diagram-file') {
            if (context.kind !== 'diagram') throw new Error('Cannot resolve diagram-file placeholder outside diagram context')
            if (!folders.diagramFile) throw new Error('Cannot resolve diagram-file placeholder without a diagram output path')

            return folders.diagramFile
        }
        if (name === 'parent-node') {
            if (context.kind !== 'diagram' || context.type !== 'child') {
                throw new Error('Cannot resolve parent-node placeholder outside child diagram context')
            }
            if (!context.parentNode) throw new Error('Cannot resolve parent-node placeholder without a selected diagram item label')

            return context.parentNode
        }
        if (name === 'conflict-file') {
            if (!context.conflictFile) throw new Error('Cannot resolve conflict-file placeholder without a selected conflict file')

            return context.conflictFile
        }
        if (name === 'conflict-files') {
            if (!context.conflictFiles) throw new Error('Cannot resolve conflict-files placeholder without conflict files')

            return context.conflictFiles
        }

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
