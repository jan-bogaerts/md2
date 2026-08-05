import type {
    AgentConversation,
    ProjectReference,
    RunningAgent,
    AgentRunEvent,
    StorageService,
} from '../../data/data_types'
import { register } from '../service_injector'
import { parseAgentConversation } from '../../../../shared/agent_conversations.mjs'

type Listener = () => void

export function parseAgentConversationLog(content: string, referencePath: string): AgentConversation {
    return parseAgentConversation(content, referencePath)
}

/** Discover persisted agent-conversation references through any storage implementation. */
export async function listAgentConversationReferences(storage: StorageService, project: ProjectReference, projectFolder: string) {
    if (!storage.listAgentConversationReferences) throw new Error('Agent conversation listing requires a storage bridge')

    return storage.listAgentConversationReferences(project, projectFolder)
}

export async function loadAgentConversation(storage: StorageService, project: ProjectReference, path: string) {
    if (!storage.loadAgentConversation) throw new Error('Agent conversation loading requires a storage bridge')

    return storage.loadAgentConversation(project, path)
}

export class AgentConversationService extends EventTarget {
    private runningAgents: RunningAgent[]

    constructor() {
        super()
        this.runningAgents = []
        register('agentConversationService', this)
    }

    getRunningAgents() {
        return this.runningAgents
    }

    observeRunEvent(event: AgentRunEvent, label: string) {
        if (event.type === 'started') {
            if (!this.runningAgents.some((agent) => agent.id === event.runId)) {
                this.setRunningAgents([...this.runningAgents, { id: event.runId, label }])
            }

            return
        }

        if (event.type === 'closed') this.removeRunningAgent(event.runId)
    }

    subscribe(listener: Listener) {
        this.addEventListener('changed', listener)

        return () => this.removeEventListener('changed', listener)
    }

    private setRunningAgents(runningAgents: RunningAgent[]) {
        this.runningAgents = runningAgents
        this.dispatchEvent(new CustomEvent('changed'))
    }

    private removeRunningAgent(runId: string) {
        this.setRunningAgents(this.runningAgents.filter((agent) => agent.id !== runId))
    }
}

export const agentConversationService = new AgentConversationService()
