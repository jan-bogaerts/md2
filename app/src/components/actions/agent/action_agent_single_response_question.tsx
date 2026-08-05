import { Button, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import type { AgentQuestion } from '../../../data/action_run_types'
import { dialogService } from '../../../services/dialog_service'

interface ActionAgentSingleResponseQuestionProps {
    onAnswer: (answers: Record<string, string[]>) => Promise<void>
    question: AgentQuestion
}

/** Submit one option question immediately from accessible answer buttons. */
export function ActionAgentSingleResponseQuestion({ onAnswer, question }: ActionAgentSingleResponseQuestionProps) {
    const [otherAnswer, setOtherAnswer] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const handleOptionClick = async (event: MouseEvent<HTMLButtonElement>) => {
        setSubmitting(true)
        try {
            const option = event.currentTarget.dataset.option
            if (!option) throw new Error('Missing structured question option')
            await onAnswer({ [question.id]: [option] })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Question answer could not be submitted' })
        } finally {
            setSubmitting(false)
        }
    }
    const handleOtherChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setOtherAnswer(event.target.value)
    }
    const handleOtherSubmit = async () => {
        setSubmitting(true)
        try {
            await onAnswer({ [question.id]: [otherAnswer] })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Question answer could not be submitted' })
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
            {question.isOther ? (
                <Stack direction="row" spacing={1}>
                    <TextField
                        autoComplete="off"
                        fullWidth
                        onChange={handleOtherChange}
                        placeholder="Other"
                        size="small"
                        slotProps={{ htmlInput: { 'aria-label': `Other answer for ${question.question}` } }}
                        type={question.isSecret ? 'password' : 'text'}
                        value={otherAnswer}
                    />
                    <Button
                        disabled={!otherAnswer.trim() || submitting}
                        onClick={handleOtherSubmit}
                        size="small"
                        variant="contained"
                    >
                        Submit
                    </Button>
                </Stack>
            ) : null}
        </Stack>
    )
}
