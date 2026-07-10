import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import type { CardDraft, CardTypeConfig } from '../../../data/data_types'

interface NewCardDialogProps {
    cardTypes: CardTypeConfig[]
    isLoading: boolean
    isProjectOpen: boolean
    open: boolean
    onClose: () => void
    onCreateCard: (draft: CardDraft) => Promise<void>
}

/** Dialog for creating a new project card. */
export function NewCardDialog(props: NewCardDialogProps) {
    const { cardTypes, isLoading, isProjectOpen, onClose, onCreateCard, open } = props
    const [body, setBody] = useState('')
    const [title, setTitle] = useState('')
    const [type, setType] = useState('feature')
    const selectedType = cardTypes.some((typeConfig) => typeConfig.type === type) ? type : cardTypes[0]?.type ?? ''

    const handleTypeChange = (event: SelectChangeEvent) => {
        setType(event.target.value)
    }

    const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setTitle(event.target.value)
    }

    const handleBodyChange = (event: ChangeEvent<HTMLInputElement>) => {
        setBody(event.target.value)
    }

    const handleCreateClick = async () => {
        if (!isProjectOpen || title.length === 0 || selectedType.length === 0) return

        const draft: CardDraft = { body, title, type: selectedType }
        try {
            await onCreateCard(draft)
        } catch {
            return
        }
        setBody('')
        setTitle('')
        setType('feature')
    }

    return (
        <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
            <DialogTitle>New card</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <FormControl size="small">
                        <InputLabel id="card-type-label">Card type</InputLabel>
                        <Select label="Card type" labelId="card-type-label" onChange={handleTypeChange} value={selectedType}>
                            {cardTypes.map((typeConfig) => (
                                <MenuItem key={typeConfig.type} value={typeConfig.type}>
                                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                        <Box sx={{ backgroundColor: typeConfig.color, borderRadius: '50%', height: 12, width: 12 }} />
                                        <span>{typeConfig.label}</span>
                                    </Stack>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField label="New card title" onChange={handleTitleChange} size="small" value={title} />
                    <TextField label="New card body" multiline onChange={handleBodyChange} size="small" value={body} />
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button disabled={!isProjectOpen || title.length === 0 || selectedType.length === 0 || isLoading} onClick={handleCreateClick} variant="contained">
                    Create card
                </Button>
            </DialogActions>
        </Dialog>
    )
}
