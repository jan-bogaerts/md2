import { answerActionQuestion, dismissActionQuestions } from '../../../services/actions/action_run_registry'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import { ActionAgentQuestion } from './action_agent_question'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

interface ActionAgentQuestionOwnerProps {
    bindingStore: ActionRunBindingStore
}

/** Subscribes structured-question UI only to its bound run. */
export function ActionAgentQuestionOwner({ bindingStore }: ActionAgentQuestionOwnerProps) {
    const boundRunId = useBoundRunId(bindingStore)
    const question = useRunSelector(boundRunId, (run) => run?.question ?? null)

    const handleAnswer = async (answers: Record<string, string[]>) => {
        if (!boundRunId) throw new Error('Missing active action run for question answer')
        if (!question) throw new Error('Missing pending agent question for answer')

        await answerActionQuestion(boundRunId, question.requestId, answers)
    }

    const handleDismiss = async () => {
        if (!boundRunId) throw new Error('Missing active action run for question dismissal')
        if (!question) throw new Error('Missing pending agent question for dismissal')

        await dismissActionQuestions(boundRunId, question.requestId)
    }

    return question
        ? <ActionAgentQuestion onAnswer={handleAnswer} onDismiss={handleDismiss} questions={question.questions} />
        : null
}
