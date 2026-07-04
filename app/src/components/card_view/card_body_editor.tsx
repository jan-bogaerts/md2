import { Stack, TextField, Typography } from '@mui/material'
import type { ChangeEvent } from 'react'
import type { ProjectCard } from '../../data/data_types'

interface CardBodyEditorProps {
    card: ProjectCard
    onBodyChange: (path: string, body: string) => void
}

/**
 * Body editing surface for a card. This is the interim textarea path; the
 * markdown editor and its formatting toolbar arrive with F-007 and replace it.
 */
export function CardBodyEditor(props: CardBodyEditorProps) {
    const { card, onBodyChange } = props

    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        onBodyChange(card.path, event.target.value)
    }

    return (
        <Stack spacing={1}>
            <Typography color="text.secondary" variant="caption">
                Formatting toolbar arrives with the markdown editor (F-007).
            </Typography>
            <TextField fullWidth minRows={6} multiline onChange={handleChange} value={card.content} />
        </Stack>
    )
}
