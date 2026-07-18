import type {
    AgentConversation,
    ProjectReference,
    RunningAgent,
    AgentRunEvent,
    StorageService,
} from '../../data/data_types'
import { register } from '.././service_injector'
import { parseAgentConversation } from '../../../../shared/agent_conversations.mjs'
import { projectLogFolder } from '../../../../shared/log_paths.mjs'

type Listener = () => void

export function parseAgentConversationLog(content: string, referencePath: string): AgentConversation {
    return parseAgentConversation(content, referencePath)
}

/** Discover persisted agent-log references through any storage implementation. */
export async function listAgentConversationReferences(storage: StorageService, project: ProjectReference, projectFolder: string) {
    const paths = await storage.listRepositoryFiles(project)
    const logFolderPrefix = `${projectLogFolder(projectFolder)}/`

    return paths.filter((path) => {
        const normalizedPath = path.replace(/\\/gu, '/')
        const fileName = normalizedPath.slice(logFolderPrefix.length)

        return normalizedPath.startsWith(logFolderPrefix)
            && fileName.startsWith('conversation__')
            && fileName.toLowerCase().endsWith('.json')
    })
}

export async function loadAgentConversation(storage: StorageService, project: ProjectReference, path: string) {
    if (!storage.loadAgentConversation) throw new Error('Agent log loading requires a storage bridge')

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
