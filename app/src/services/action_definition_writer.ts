import type { ActionContext } from '../data/action_context'
import type { RawActionDefinition } from '../data/action_types'

const ACTION_FILE_EXTENSION = '.json'

export interface ConvertPromptToActionInput {
    context: ActionContext
    description?: string
    label: string
    prompt: string
}

function toActionName(label: string) {
    const name = label.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')
    if (name.length === 0) throw new Error('Missing action label')

    return name
}

export function actionFilePath(actionsFolder: string, name: string) {
    return `${actionsFolder}/${name}${ACTION_FILE_EXTENSION}`
}

export function createActionDefinition(input: ConvertPromptToActionInput): RawActionDefinition {
    const name = toActionName(input.label)
    const description = input.description?.trim()

    return {
        appliesTo: input.context.type ? { type: input.context.type } : undefined,
        description: description && description.length > 0 ? description : `Custom prompt action: ${input.label.trim()}`,
        label: input.label.trim(),
        name,
        text: input.prompt,
        type: 'agent',
    }
}
