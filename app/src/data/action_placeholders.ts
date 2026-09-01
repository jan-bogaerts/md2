export interface ActionPlaceholder {
    description: string
    name: 'active-cards-folder' | 'card-file' | 'card-prompt' | 'card-title' | 'diagram-file' | 'parent-node' | 'project-folder' | 'releases-folder' | 'repository-folder' | 'this-card' | 'worktree-folder'
}

export const ACTION_PROMPT_PLACEHOLDERS: readonly ActionPlaceholder[] = [
    { description: 'Absolute path to the folder containing root-level Markdown cards shown on the dashboard.', name: 'active-cards-folder' },
    { description: 'Path to the selected Markdown card file.', name: 'card-file' },
    { description: 'Alias of {{card-file}} with the same selected Markdown card file path.', name: 'this-card' },
    { description: 'Title of the selected card.', name: 'card-title' },
    { description: 'Additional prompt entered when the card action runs.', name: 'card-prompt' },
    { description: 'Absolute path where the current diagram action must save its SVG output.', name: 'diagram-file' },
    { description: 'Label of the selected parent diagram item for a child diagram action.', name: 'parent-node' },
    { description: 'Absolute path to the configured project folder.', name: 'project-folder' },
    { description: 'Absolute path to the configured releases folder.', name: 'releases-folder' },
    { description: 'Absolute path to the opened repository.', name: 'repository-folder' },
    { description: 'Absolute path to the action run checkout.', name: 'worktree-folder' },
]

/** Format an action placeholder for insertion into template text. */
export function formatActionPlaceholder(name: ActionPlaceholder['name']) {
    return `{{${name}}}`
}
