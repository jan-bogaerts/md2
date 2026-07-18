import { useSyncExternalStore } from 'react'
import { agentAcknowledgementService } from '../../services/agents/agent_acknowledgement_service'

let revision = 0

function subscribe(onStoreChange: () => void) {
    const handleChange = () => {
        revision += 1
        onStoreChange()
    }
    agentAcknowledgementService.addEventListener('changed', handleChange)

    return () => agentAcknowledgementService.removeEventListener('changed', handleChange)
}

export function useAgentAcknowledgements() {
    return useSyncExternalStore(subscribe, () => revision)
}
