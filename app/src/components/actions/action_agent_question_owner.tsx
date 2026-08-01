import type { ActionContext } from '../../data/action_context'
import { actionRunRegistry, answerActionQuestion } from '../../services/actions/action_run_registry'
import { dialogService } from '../../services/dialog_service'
import { useActionRunSelector } from '../hooks/use_action_runs'
import { ActionAgentQuestion } from './action_agent_question'

interface ActionAgentQuestionOwnerProps {
    actionId: string
    context: ActionContext
}

/** Subscribes structured-question UI only to its bound run. */
export function ActionAgentQuestionOwner({ actionId, context }: ActionAgentQuestionOwnerProps) {
    const question = useActionRunSelector(actionId, context, (run) => run?.question ?? null)

    const handleAnswer = async (answers: Record<string, string[]>) => {
        const currentRunId = actionRunRegistry.getActionRunStore(actionId, context)?.getSnapshot().runId
        if (!currentRunId || !question) return

        try {
            await answerActionQuestion(currentRunId, question.requestId, answers)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not answer agent question' })
        }
    }

    return question ? <ActionAgentQuestion onAnswer={handleAnswer} questions={question.questions} /> : null
}
