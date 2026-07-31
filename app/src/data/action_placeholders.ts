export interface ActionPlaceholder {
    description: string
    name: 'card-file' | 'card-prompt' | 'card-title' | 'project-folder' | 'releases-folder' | 'worktree-folder'
}

export const ACTION_PROMPT_PLACEHOLDERS: readonly ActionPlaceholder[] = [
    { description: 'Path to the selected Markdown card file.', name: 'card-file' },
    { description: 'Title of the selected card.', name: 'card-title' },
    { description: 'Additional prompt entered when the card action runs.', name: 'card-prompt' },
    { description: 'Absolute path to the opened repository.', name: 'project-folder' },
    { description: 'Absolute path to the configured releases folder.', name: 'releases-folder' },
    { description: 'Absolute path to the action execution checkout.', name: 'worktree-folder' },
]

/** Format an action placeholder for insertion into template text. */
export function formatActionPlaceholder(name: ActionPlaceholder['name']) {
    return `{{${name}}}`
}
