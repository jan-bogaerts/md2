import type { ActionContext } from '../../../../data/action_context'
import type { AgentConversation, AgentConversationMessageEntry } from '../../../../data/data_types'
import { getElectronActionBridge } from '../../../../data/electron_action_bridge'
import { actionService } from '../../../../services/actions/action_service'
import { dataService } from '../../../../services/data/data_service'
import { projectAccessService } from '../../../../services/project/project_access_service'
import { defaultConvertPromptToAction } from '../../run/popup/action_popup_defaults'
import type { ActionConversationStore } from './action_conversation_store'

export function firstPromptMessageId(conversation: AgentConversation) {
    return conversation.entries.find((entry) => entry.kind === 'message' && entry.role === 'user')?.id ?? null
}

export interface ActionConversationCommandOperations {
    canSaveResponsePhrase(): boolean
    saveAsNewAction(message: AgentConversationMessageEntry, label: string): Promise<void>
    saveAsResponsePhrase(message: AgentConversationMessageEntry): Promise<void>
    split(conversation: AgentConversation, message: AgentConversationMessageEntry): Promise<void>
}

/** Owns transcript mutation commands for one action popup. */
export class ActionConversationCommandService implements ActionConversationCommandOperations {
    private readonly actionId: string
    private readonly context: ActionContext
    private readonly store: ActionConversationStore

    constructor(actionId: string, context: ActionContext, store: ActionConversationStore) {
        this.actionId = actionId
        this.context = context
        this.store = store
    }

    canSaveResponsePhrase() {
        return !!actionService.getActionById(this.actionId)?.sourcePath
    }

    async saveAsNewAction(message: AgentConversationMessageEntry, label: string) {
        projectAccessService.requireWritable()
        const action = actionService.getActionById(this.actionId)
        if (!action) throw new Error(`Cannot save message from unknown action: ${this.actionId}`)
        const input = {
            ...(action.agent ? { agent: action.agent } : {}),
            context: this.context,
            label,
            ...(action.model ? { model: action.model } : {}),
            ...(action.permissionMode ? { permissionMode: action.permissionMode } : {}),
            prompt: message.content,
        }
        await defaultConvertPromptToAction(input)
    }

    async saveAsResponsePhrase(message: AgentConversationMessageEntry) {
        await actionService.appendResponsePhrase(this.actionId, message.content)
    }

    async split(conversation: AgentConversation, message: AgentConversationMessageEntry) {
        projectAccessService.requireWritable()
        if (conversation.status === 'running') throw new Error('Cannot split a running agent conversation')
        const bridge = getElectronActionBridge()
        if (!bridge?.splitActionConversation) throw new Error('Splitting an agent conversation requires Electron')

        const splitConversation = await bridge.splitActionConversation(conversation.path, message.id)
        dataService.agents.updateAgentConversation(splitConversation)
        this.store.addAndSelectConversation(splitConversation)
    }
}
