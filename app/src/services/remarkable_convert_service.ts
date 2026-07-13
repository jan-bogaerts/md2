import type { ActionContext } from '../data/action_context'
import type { ActionDefinition } from '../data/action_types'
import type { ActionRunResult } from '../data/action_run_types'
import { getElectronActionBridge } from '../data/electron_action_bridge'
import { runElectronAction } from './electron_action_runner'

const CONVERT_ACTION_NAME = 'convert-remarkable-images-to-text'
const CONVERT_ACTION_ID = 'md2.convert-remarkable-images-to-text'
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
        agent: null,
        appliesTo: null,
        builtin: true,
        command: null,
        description: 'Transcribe imported Remarkable images and append the text to the card.',
        icon: null,
        id: CONVERT_ACTION_ID,
        label: CONVERT_ACTION_LABEL,
        model: null,
        name: CONVERT_ACTION_NAME,
        needsWorkTree: false,
        on: [],
        onAfter: [],
        onBefore: [],
        onState: null,
        prompt: `Convert the following Remarkable images to text and append the transcription to {{file}}:\n${imageList}`,
        sourcePath: null,
        thinkingLevel: null,
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

    const imageList = input.imagePaths.map((path) => `- ${path}`).join('\n')
    const run = dependencies.run ?? ((action, context) => runElectronAction(action, context, { extraPrompt: imageList }))
    const context: ActionContext = { file: input.cardPath, kind: 'card', ...(input.cardType ? { type: input.cardType } : {}) }

    return run(buildConvertAction(input.imagePaths), context)
}
