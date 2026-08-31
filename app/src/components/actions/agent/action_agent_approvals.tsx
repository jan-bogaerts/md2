import type { AgentApprovalDecision, AgentApprovalRequestId } from '../../../data/action_run_types'
import { answerActionApproval } from '../../../services/actions/action_run_registry'
import { dialogService } from '../../../services/dialog_service'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import { ActionAgentApproval } from './action_agent_approval'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

interface ActionAgentApprovalsProps {
    bindingStore: ActionRunBindingStore
}

/** Subscribes approval UI only to its bound run. */
export function ActionAgentApprovals({ bindingStore }: ActionAgentApprovalsProps) {
    const boundRunId = useBoundRunId(bindingStore)
    const approvals = useRunSelector(boundRunId, (run) => run?.approvals ?? null)

    const handleDecision = async (requestId: AgentApprovalRequestId, decision: AgentApprovalDecision) => {
        if (!boundRunId) return

        try {
            await answerActionApproval(boundRunId, requestId, decision)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not answer agent approval' })
            throw error
        }
    }

    return approvals?.map((approval) => (
        <ActionAgentApproval
            approval={approval}
            key={`${typeof approval.requestId}-${approval.requestId}`}
            onDecision={handleDecision}
        />
    )) ?? null
}
