import { Button, Stack } from '@mui/material'
import type { MouseEvent } from 'react'
import type { ActionPhrase } from '../../../data/action_types'
import { dialogService } from '../../../services/dialog_service'
import { actionPhraseLabel } from './action_phrase_label'

interface ActionPhraseButtonsProps {
    onDoubleClick: (text: string) => Promise<void>
    onSelect: (text: string) => Promise<void>
    phrases: ActionPhrase[]
}

/** Quick follow-up controls shown once an agent conversation can continue. */
export function ActionPhraseButtons(props: ActionPhraseButtonsProps) {
    const { onDoubleClick, onSelect, phrases } = props

    const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
        try {
            if (event.detail > 1) return

            const text = event.currentTarget.dataset.phraseText
            if (text === undefined) throw new Error('Missing predefined phrase text')
            await onSelect(text)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Predefined phrase could not be selected' })
        }
    }

    const handleDoubleClick = async (event: MouseEvent<HTMLButtonElement>) => {
        try {
            const text = event.currentTarget.dataset.phraseText
            if (text === undefined) throw new Error('Missing predefined phrase text')
            await onDoubleClick(text)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Predefined phrase could not be submitted' })
        }
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
