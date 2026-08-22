import type { ActionContext } from '../../../data/action_context'
import { actionRunRegistry, answerActionQuestion, dismissActionQuestions } from '../../../services/actions/action_run_registry'
import { useActionRunSelector } from '../../hooks/use_action_runs'
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
        if (!currentRunId) throw new Error('Missing active action run for question answer')
        if (!question) throw new Error('Missing pending agent question for answer')

        await answerActionQuestion(currentRunId, question.requestId, answers)
    }

    const handleDismiss = async () => {
        const currentRunId = actionRunRegistry.getActionRunStore(actionId, context)?.getSnapshot().runId
        if (!currentRunId) throw new Error('Missing active action run for question dismissal')
        if (!question) throw new Error('Missing pending agent question for dismissal')

        await dismissActionQuestions(currentRunId, question.requestId)
    }

    return question
        ? <ActionAgentQuestion onAnswer={handleAnswer} onDismiss={handleDismiss} questions={question.questions} />
        : null
}
