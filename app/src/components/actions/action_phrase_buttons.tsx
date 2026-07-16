import { Button, Stack } from '@mui/material'
import type { MouseEvent } from 'react'
import type { ActionPhrase } from '../../data/action_types'
import { actionPhraseLabel } from './action_phrase_label'

interface ActionPhraseButtonsProps {
    onDoubleClick: (text: string) => void
    onSelect: (text: string) => void
    phrases: ActionPhrase[]
}

/** Quick follow-up controls shown once an agent conversation can continue. */
export function ActionPhraseButtons(props: ActionPhraseButtonsProps) {
    const { onDoubleClick, onSelect, phrases } = props

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        const text = event.currentTarget.dataset.phraseText
        if (text === undefined) throw new Error('Missing predefined phrase text')
        onSelect(text)
    }

    const handleDoubleClick = (event: MouseEvent<HTMLButtonElement>) => {
        const text = event.currentTarget.dataset.phraseText
        if (text === undefined) throw new Error('Missing predefined phrase text')
        onDoubleClick(text)
    }

    return (
        <Stack aria-label="Predefined phrases" direction="row" role="group" sx={{ flexWrap: 'wrap', gap: 1 }}>
            {phrases.map(({ text, title }, index) => (
                <Button
                    data-phrase-text={text}
                    key={`${index}-${title}-${text}`}
                    onClick={handleClick}
                    onDoubleClick={handleDoubleClick}
                    size="small"
                    variant="outlined"
                >
                    {actionPhraseLabel(title, text)}
                </Button>
            ))}
        </Stack>
    )
}
