import type { AgentQuestion } from '../../../data/data_types'
import { answerActionQuestion, dismissActionQuestions } from '../../../services/actions/action_run_registry'
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import { ActionAgentQuestion } from './action_agent_question'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

/** A question read back from a stored conversation after the agent process is gone. */
export interface RestoredAgentQuestions {
    onAnswer: (questions: AgentQuestion[], answers: Record<string, string[]>) => Promise<void>
    onDismiss: () => Promise<void>
    questions: AgentQuestion[]
}

interface ActionAgentQuestionOwnerProps {
    bindingStore: ActionRunBindingStore
    restored?: RestoredAgentQuestions | null
}

/** Subscribes structured-question UI only to its bound run, falling back to a restored stored question. */
export function ActionAgentQuestionOwner({ bindingStore, restored = null }: ActionAgentQuestionOwnerProps) {
    const boundRunId = useBoundRunId(bindingStore)
    const question = useRunSelector(boundRunId, (run) => run?.question ?? null)

    const handleAnswer = async (answers: Record<string, string[]>) => {
        if (!question) {
            if (!restored) throw new Error('Missing pending agent question for answer')

            await restored.onAnswer(restored.questions, answers)
            return
        }
        if (!boundRunId) throw new Error('Missing active action run for question answer')

        await answerActionQuestion(boundRunId, question.requestId, answers)
    }

    const handleDismiss = async () => {
        if (!question) {
            if (!restored) throw new Error('Missing pending agent question for dismissal')

            await restored.onDismiss()
            return
        }
        if (!boundRunId) throw new Error('Missing active action run for question dismissal')

        await dismissActionQuestions(boundRunId, question.requestId)
    }

    const questions = question?.questions ?? restored?.questions ?? null

    return questions
        ? <ActionAgentQuestion onAnswer={handleAnswer} onDismiss={handleDismiss} questions={questions} />
        : null
}
