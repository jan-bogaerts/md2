import { useSyncExternalStore } from 'react'
import {
    AGENT_INSTRUCTION_FILES_CHANGED_EVENT,
    agentInstructionsService,
} from '../../services/agent_instructions/agent_instructions_service'

function subscribe(onStoreChange: () => void) {
    agentInstructionsService.addEventListener(AGENT_INSTRUCTION_FILES_CHANGED_EVENT, onStoreChange)

    return () => agentInstructionsService.removeEventListener(AGENT_INSTRUCTION_FILES_CHANGED_EVENT, onStoreChange)
}

/** Subscribes to service-owned agent-instruction files and load errors. */
export function useAgentInstructions() {
    return useSyncExternalStore(
        subscribe,
        () => agentInstructionsService.getSnapshot(),
        () => agentInstructionsService.getSnapshot(),
    )
}
