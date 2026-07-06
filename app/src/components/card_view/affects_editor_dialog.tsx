import { Autocomplete, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import { useMemo, useState } from 'react'
import type { ProjectCard } from '../../data/data_types'
import { filterAffectsSuggestions } from './affects_suggestions'

interface AffectsEditorDialogProps {
    card: ProjectCard | null
    onClose: () => void
    onSave: (path: string, affects: string[]) => void
    repositoryFiles: string[]
}

interface AffectedFileChipProps {
    path: string
    onRemove: (path: string) => void
}

interface AffectsEditorContentProps {
    card: ProjectCard
    onClose: () => void
    onSave: (path: string, affects: string[]) => void
    repositoryFiles: string[]
}

function AffectedFileChip(props: AffectedFileChipProps) {
    const { onRemove, path } = props

    const handleDelete = () => {
        onRemove(path)
    }

    return <Chip label={path} onDelete={handleDelete} />
}

function AffectsEditorContent(props: AffectsEditorContentProps) {
    const { card, onClose, onSave, repositoryFiles } = props
    const [draftAffects, setDraftAffects] = useState<string[]>(card.header.affects)
    const [input, setInput] = useState('')

    const suggestions = useMemo(
        () => filterAffectsSuggestions(repositoryFiles, draftAffects, card.path, input),
        [card, draftAffects, input, repositoryFiles],
    )
    const canAddInput = repositoryFiles.includes(input.trim()) && suggestions.includes(input.trim())

    const addPath = (path: string) => {
        if (!filterAffectsSuggestions(repositoryFiles, draftAffects, card.path, path).includes(path)) return

        setDraftAffects((current) => [...current, path])
        setInput('')
    }

    const handleInputChange = (_event: unknown, value: string) => {
        setInput(value)
    }

    const handleSelectionChange = (_event: unknown, value: string | null) => {
        if (value) addPath(value)
    }

    const handleAddInput = () => {
        addPath(input.trim())
    }

    const handleRemove = (path: string) => {
        setDraftAffects((current) => current.filter((entry) => entry !== path))
    }

    const handleSave = () => {
        onSave(card.path, draftAffects)
        onClose()
    }

    return (
        <>
            <DialogTitle>
                Edit affects for {card.header.id}
            </DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                        <Autocomplete
                            freeSolo
                            inputValue={input}
                            onChange={handleSelectionChange}
                            onInputChange={handleInputChange}
                            options={suggestions}
                            renderInput={(params) => <TextField {...params} label="Add affected file" />}
                            sx={{ flex: 1 }}
                            value={null}
                        />
                        <Button disabled={!canAddInput} onClick={handleAddInput} variant="outlined">
                            Add
                        </Button>
                    </Stack>
                    {draftAffects.length > 0 ? (
                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                            {draftAffects.map((path) => (
                                <AffectedFileChip key={path} onRemove={handleRemove} path={path} />
                            ))}
                        </Stack>
                    ) : (
                        <Typography color="text.secondary" variant="body2">
                            No affected files.
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained">Save</Button>
            </DialogActions>
        </>
    )
}

/** Dialog for editing the repo-relative file paths in a card's affects header. */
export function AffectsEditorDialog(props: AffectsEditorDialogProps) {
    const { card, onClose, onSave, repositoryFiles } = props

    return (
        <Dialog fullWidth maxWidth="sm" onClose={onClose} open={!!card}>
            {card ? (
                <AffectsEditorContent
                    key={card.path}
                    card={card}
                    onClose={onClose}
                    onSave={onSave}
                    repositoryFiles={repositoryFiles}
                />
            ) : null}
        </Dialog>
    )
}
