import { type ElectronActionBridge, getElectronActionBridge } from '../../data/electron_action_bridge'
import type { AgentRunEvent } from '../../data/data_types'
import { agentConversationService } from '../agents/agent_conversation_service'
import type { SearchRegexpAgent } from './search_types'

const CODE_FENCE_PATTERN = /^```[^\n]*\n([\s\S]*?)\n?```$/u
const REGEX_LITERAL_PATTERN = /^\/(.+)\/[a-z]*$/u

export interface SearchRegexpAgentDependencies {
    bridgeProvider?: () => ElectronActionBridge | null
    runEventObserver?: (event: AgentRunEvent) => void
}

function defaultRunEventObserver(event: AgentRunEvent) {
    agentConversationService.observeRunEvent(event, 'Search RegExp')
}

export function extractRegexpExpression(rawOutput: string): string {
    let expression = rawOutput.trim()

    const fenceMatch = CODE_FENCE_PATTERN.exec(expression)
    if (fenceMatch) expression = fenceMatch[1].trim()

    const literalMatch = REGEX_LITERAL_PATTERN.exec(expression)
    if (literalMatch) expression = literalMatch[1]

    expression = expression.trim()
    if (expression.length === 0) throw new Error('Agent returned an empty regular expression')

    try {
        new RegExp(expression)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid regular expression'
        throw new Error(`Agent returned an invalid regular expression: ${message}`)
    }

    return expression
}

export function isSearchRegexpAgentAvailable(bridgeProvider: () => ElectronActionBridge | null = getElectronActionBridge): boolean {
    return bridgeProvider() !== null
}

export function createSearchRegexpAgent(dependencies: SearchRegexpAgentDependencies = {}): SearchRegexpAgent {
    const bridgeProvider = dependencies.bridgeProvider ?? getElectronActionBridge
    const runEventObserver = dependencies.runEventObserver ?? defaultRunEventObserver

    return async (naturalQuery: string) => {
        const bridge = bridgeProvider()
        if (!bridge) throw new Error('RegExp agent is not available')

        const result = await bridge.runSearchRegexpAgent(naturalQuery, runEventObserver)

        return extractRegexpExpression(result)
    }
}
