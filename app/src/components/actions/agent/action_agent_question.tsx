import { Button, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import type { ChangeEvent } from 'react'
import type { SelectChangeEvent } from '@mui/material'
import type { AgentQuestion } from '../../../data/action_run_types'
import { dialogService } from '../../../services/dialog_service'
import { ActionAgentSingleResponseQuestion } from './action_agent_single_response_question'

interface ActionAgentQuestionProps {
    onAnswer: (answers: Record<string, string[]>) => Promise<void>
    questions: AgentQuestion[]
}

/** Structured provider questions shown while a streaming turn waits for user input. */
export function ActionAgentQuestion({ onAnswer, questions }: ActionAgentQuestionProps) {
    const [answers, setAnswers] = useState<Record<string, string>>({})
    const [submitting, setSubmitting] = useState(false)
    const complete = questions.every(({ id }) => (answers[id] ?? '').trim().length > 0)
    const handleTextChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        try {
            if (!event.target.name) throw new Error('Missing structured question id')
            setAnswers((current) => ({ ...current, [event.target.name]: event.target.value }))
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Question answer could not be updated' })
        }
    }
    const handleSelectChange = (event: SelectChangeEvent) => {
        try {
            if (!event.target.name) throw new Error('Missing structured question id')
            setAnswers((current) => ({ ...current, [event.target.name]: event.target.value }))
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Question answer could not be updated' })
        }
    }
    const handleOtherChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        try {
            if (!event.target.name) throw new Error('Missing structured question id')
            setAnswers((current) => ({ ...current, [event.target.name]: event.target.value }))
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Other question answer could not be updated' })
        }
    }
    const handleSubmit = async () => {
        setSubmitting(true)
        try {
            const submittedAnswers = Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, [answer]]))
            await onAnswer(submittedAnswers)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Question answers could not be submitted' })
        } finally {
            setSubmitting(false)
        }
    }
    const singleQuestion = questions.length === 1 ? questions[0] : null
    if (singleQuestion?.options?.length) {
        return <ActionAgentSingleResponseQuestion onAnswer={onAnswer} question={singleQuestion} />
    }

    return (
        <Stack spacing={1.5} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
            {questions.map((question) => (
                <Stack key={question.id} spacing={0.75}>
                    <Typography color="text.secondary" variant="caption">{question.header}</Typography>
                    <Typography color="text.primary" variant="body2">{question.question}</Typography>
                    {question.options?.length ? (
                        <Select
                            aria-label={question.question}
                            name={question.id}
                            onChange={handleSelectChange}
                            size="small"
                            value={question.options.some(({ label }) => label === answers[question.id]) ? answers[question.id] : ''}
                        >
                            {question.options.map((option) => (
                                <MenuItem key={option.label} value={option.label}>
                                    {option.label}{option.description ? ` — ${option.description}` : ''}
                                </MenuItem>
                            ))}
                        </Select>
                    ) : (
                        <TextField
                            autoComplete="off"
                            name={question.id}
                            onChange={handleTextChange}
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': question.question } }}
                            type={question.isSecret ? 'password' : 'text'}
                            value={answers[question.id] ?? ''}
                        />
                    )}
                    {question.options?.length && question.isOther ? (
                        <TextField
                            autoComplete="off"
                            name={question.id}
                            onChange={handleOtherChange}
                            placeholder="Other"
                            size="small"
                            slotProps={{ htmlInput: { 'aria-label': `Other answer for ${question.question}` } }}
                            type={question.isSecret ? 'password' : 'text'}
                            value={question.options.some(({ label }) => label === answers[question.id]) ? '' : answers[question.id] ?? ''}
                        />
                    ) : null}
                </Stack>
            ))}
            <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                <Button disabled={!complete || submitting} onClick={handleSubmit} size="small" variant="contained">
                    Submit
                </Button>
            </Stack>
        </Stack>
    )
}
