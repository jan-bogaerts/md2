import { Button, MenuItem, Select, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import type { ChangeEvent, MouseEvent } from 'react'
import type { SelectChangeEvent } from '@mui/material'
import type { AgentQuestion } from '../../../data/action_run_types'
import { dialogService } from '../../../services/dialog_service'

interface ActionAgentQuestionProps {
    onAnswer: (answers: Record<string, string[]>) => Promise<void>
    onDismiss: () => Promise<void>
    questions: AgentQuestion[]
}

/** Structured provider questions shown while a streaming turn waits for user input. */
export function ActionAgentQuestion({ onAnswer, onDismiss, questions }: ActionAgentQuestionProps) {
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
    const submitAnswers = async (submittedAnswers: Record<string, string[]>) => {
        setSubmitting(true)
        try {
            await onAnswer(submittedAnswers)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Question answers could not be submitted' })
        } finally {
            setSubmitting(false)
        }
    }
    const handleSubmit = async () => {
        const submittedAnswers = Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, [answer]]))
        await submitAnswers(submittedAnswers)
    }
    const handleOptionClick = async (event: MouseEvent<HTMLButtonElement>) => {
        const option = event.currentTarget.dataset.option
        const singleQuestion = questions[0]
        if (!option || !singleQuestion) {
            dialogService.error(
                new Error('Missing structured question option'),
                { fallbackMessage: 'Question answer could not be submitted' },
            )
            return
        }

        await submitAnswers({ [singleQuestion.id]: [option] })
    }
    const handleDismiss = async () => {
        setSubmitting(true)
        try {
            await onDismiss()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Questions could not be dismissed' })
        } finally {
            setSubmitting(false)
        }
    }
    const singleQuestion = questions.length === 1 ? questions[0] : null
    if (singleQuestion?.options?.length) {
        return (
            <Stack spacing={1.5} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                <Typography color="text.secondary" variant="caption">{singleQuestion.header}</Typography>
                <Typography color="text.primary" variant="body2">{singleQuestion.question}</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {singleQuestion.options.map((option) => (
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
                <Stack direction="row" spacing={1}>
                    <TextField
                        autoComplete="off"
                        fullWidth
                        name={singleQuestion.id}
                        onChange={handleOtherChange}
                        placeholder="Other"
                        size="small"
                        slotProps={{ htmlInput: { 'aria-label': `Other answer for ${singleQuestion.question}` } }}
                        type={singleQuestion.isSecret ? 'password' : 'text'}
                        value={answers[singleQuestion.id] ?? ''}
                    />
                    <Button
                        disabled={!complete || submitting}
                        onClick={handleSubmit}
                        size="small"
                        variant="contained"
                    >
                        Submit
                    </Button>
                </Stack>
                <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                    <Button disabled={submitting} onClick={handleDismiss} size="small" variant="outlined">
                        Cancel questions
                    </Button>
                </Stack>
            </Stack>
        )
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
                    {question.options?.length ? (
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
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button disabled={submitting} onClick={handleDismiss} size="small" variant="outlined">
                    Cancel questions
                </Button>
                <Button disabled={!complete || submitting} onClick={handleSubmit} size="small" variant="contained">
                    Submit
                </Button>
            </Stack>
        </Stack>
    )
}
