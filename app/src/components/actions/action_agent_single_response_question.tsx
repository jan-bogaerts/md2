import { Button, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { AgentQuestion } from '../../data/action_run_types'

interface ActionAgentSingleResponseQuestionProps {
    onAnswer: (answers: Record<string, string[]>) => Promise<void>
    question: AgentQuestion
}

/** Submit one option question immediately from accessible answer buttons. */
export function ActionAgentSingleResponseQuestion({ onAnswer, question }: ActionAgentSingleResponseQuestionProps) {
    const [submitting, setSubmitting] = useState(false)
    const handleOptionClick = async (event: MouseEvent<HTMLButtonElement>) => {
        const option = event.currentTarget.dataset.option
        if (!option) throw new Error('Missing structured question option')
        setSubmitting(true)
        try {
            await onAnswer({ [question.id]: [option] })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Stack spacing={1.5} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
            <Typography color="text.secondary" variant="caption">{question.header}</Typography>
            <Typography color="text.primary" variant="body2">{question.question}</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {question.options?.map((option) => (
                    <Button
                        data-option={option.label}
                        disabled={submitting}
                        key={option.label}
                        onClick={handleOptionClick}
                        size="small"
                        variant="outlined"
                    >
                        {option.label}
                    </Button>
                ))}
            </Stack>
        </Stack>
    )
}
