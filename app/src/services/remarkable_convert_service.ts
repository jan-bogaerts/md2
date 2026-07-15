import type { ActionContext } from '../data/action_context'
import { BUILTIN_REMARKABLE_CONVERT, type ActionDefinition } from '../data/action_types'
import type { ActionRunResult } from '../data/action_run_types'
import { getElectronActionBridge } from '../data/electron_action_bridge'
import { runElectronAction } from './electron_action_runner'

export interface ConvertRemarkableImagesInput {
    cardPath: string
    cardType?: string
    imagePaths: string[]
}

interface ConvertRemarkableImagesDependencies {
    isAgentAvailable?: () => boolean
    run?: (action: ActionDefinition, context: ActionContext, input: { extraPrompt: string }) => Promise<ActionRunResult>
}

/** True when a local agent can be executed, which gates the image-to-text card action. */
export function isAgentExecutionAvailable() {
    return !!getElectronActionBridge()
}

/**
 * Start an agent run that transcribes the given imported images and links the result to the card
 * (through the card action context). Throws when no agent is available so the caller can hide the
 * action, and when there are no images to convert.
 */
export async function convertRemarkableImagesToText(
    input: ConvertRemarkableImagesInput,
    dependencies: ConvertRemarkableImagesDependencies = {},
): Promise<ActionRunResult> {
    const isAgentAvailable = dependencies.isAgentAvailable ?? isAgentExecutionAvailable
    if (!isAgentAvailable()) throw new Error('Image-to-text conversion requires an available agent')
    if (input.imagePaths.length === 0) throw new Error('No imported images to convert')

    const imageList = input.imagePaths.map((path) => `- ${path}`).join('\n')
    const run = dependencies.run ?? runElectronAction
    const context: ActionContext = { file: input.cardPath, kind: 'card', ...(input.cardType ? { type: input.cardType } : {}) }

    return run(BUILTIN_REMARKABLE_CONVERT, context, { extraPrompt: imageList })
}
