import type { ActionContext } from '../data/action_context'
import type { RawActionDefinition } from '../data/action_types'

const ACTION_FILE_EXTENSION = '.json'

export interface ConvertPromptToActionInput {
    agent?: string
    context: ActionContext
    description?: string
    label: string
    model?: string
    prompt: string
}

function toActionFileName(label: string) {
    const fileName = label.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')
    if (fileName.length === 0) throw new Error('Missing action label')

    return fileName
}

export function actionFilePath(actionsFolder: string, label: string) {
    return `${actionsFolder}/${toActionFileName(label)}${ACTION_FILE_EXTENSION}`
}

export function createActionDefinition(input: ConvertPromptToActionInput): RawActionDefinition {
    const description = input.description?.trim()

    return {
        ...(input.agent ? { agent: input.agent } : {}),
        appliesTo: input.context.type ? { type: input.context.type } : undefined,
        description: description && description.length > 0 ? description : `Custom prompt action: ${input.label.trim()}`,
        id: crypto.randomUUID(),
        label: input.label.trim(),
        ...(input.model ? { model: input.model } : {}),
        phrases: [],
        prompt: input.prompt,
        type: 'agent',
    }
}
