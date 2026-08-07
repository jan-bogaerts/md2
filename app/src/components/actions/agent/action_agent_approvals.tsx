import type { ActionContext } from '../../../data/action_context'
import type { AgentApprovalDecision, AgentApprovalRequestId } from '../../../data/action_run_types'
import { actionRunRegistry, answerActionApproval } from '../../../services/actions/action_run_registry'
import { dialogService } from '../../../services/dialog_service'
import { useActionRunSelector } from '../../hooks/use_action_runs'
import { ActionAgentApproval } from './action_agent_approval'

interface ActionAgentApprovalsProps {
    actionId: string
    context: ActionContext
}

/** Subscribes approval UI only to its bound run. */
export function ActionAgentApprovals({ actionId, context }: ActionAgentApprovalsProps) {
    const approvals = useActionRunSelector(actionId, context, (run) => run?.approvals ?? null)

    const handleDecision = async (requestId: AgentApprovalRequestId, decision: AgentApprovalDecision) => {
        const currentRunId = actionRunRegistry.getActionRunStore(actionId, context)?.getSnapshot().runId
        if (!currentRunId) return

        try {
            await answerActionApproval(currentRunId, requestId, decision)
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
