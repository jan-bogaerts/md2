import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import { getElectronActionBridge } from '../data/electron_action_bridge'
import { actionRunner, type ActionRunResult } from './action_runner'

const CONVERT_ACTION_NAME = 'convert-remarkable-images-to-text'
const CONVERT_ACTION_LABEL = 'Convert Remarkable images to text'

export interface ConvertRemarkableImagesInput {
    cardPath: string
    cardType?: string
    imagePaths: string[]
}

interface ConvertRemarkableImagesDependencies {
    isAgentAvailable?: () => boolean
    run?: (action: ActionDefinition, context: ActionContext) => Promise<ActionRunResult>
}

/** True when a local agent can be executed, which gates the image-to-text card action. */
export function isAgentExecutionAvailable() {
    return !!getElectronActionBridge()
}

function buildConvertAction(imagePaths: string[]): ActionDefinition {
    const imageList = imagePaths.map((path) => `- ${path}`).join('\n')

    return {
        after: [],
        agent: null,
        appliesTo: null,
        before: [],
        builtin: true,
        description: 'Transcribe imported Remarkable images and append the text to the card.',
        icon: null,
        label: CONVERT_ACTION_LABEL,
        model: null,
        name: CONVERT_ACTION_NAME,
        on: [],
        onState: null,
        runIn: 'project',
        text: `Convert the following Remarkable images to text and append the transcription to {{file}}:\n${imageList}`,
        type: 'agent',
    }
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

    const run = dependencies.run ?? ((action, context) => actionRunner.run(action, context))
    const context: ActionContext = { file: input.cardPath, kind: 'card', ...(input.cardType ? { type: input.cardType } : {}) }

    return run(buildConvertAction(input.imagePaths), context)
}
