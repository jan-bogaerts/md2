export interface ActionPlaceholder {
    description: string
    name: 'card-file' | 'card-prompt' | 'rootProjectFolder'
}

export const ACTION_PROMPT_PLACEHOLDERS: readonly ActionPlaceholder[] = [
    { description: 'Path to the selected Markdown card file.', name: 'card-file' },
    { description: 'Additional prompt entered when the card action runs.', name: 'card-prompt' },
    { description: 'Absolute path to the local project root.', name: 'rootProjectFolder' },
]

/** Format an action placeholder for insertion into template text. */
export function formatActionPlaceholder(name: ActionPlaceholder['name']) {
    return `{{${name}}}`
}
