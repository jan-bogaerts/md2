import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'
import { type ChangeEvent, type FormEvent, useState } from 'react'

export type CreateTreeItemKind = 'folder' | 'markdownFile'

interface CreateTreeItemDialogProps {
    kind: CreateTreeItemKind
    onClose: () => void
    onCreate: (name: string) => Promise<void>
    open: boolean
    parentDirectory: string
}

/** Collect a name for a folder or Markdown file created from the project tree. */
export function CreateTreeItemDialog(props: CreateTreeItemDialogProps) {
    const { kind, onClose, onCreate, open, parentDirectory } = props
    const [isCreating, setIsCreating] = useState(false)
    const [name, setName] = useState('')
    const isFolder = kind === 'folder'

    const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
        setName(event.target.value)
    }

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault()
        if (name.trim().length === 0) return

        setIsCreating(true)
        try {
            await onCreate(name)
            onClose()
        } catch {
            // The workspace owns the user-visible creation error.
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <Dialog fullWidth maxWidth="xs" onClose={isCreating ? undefined : onClose} open={open}>
            <DialogTitle>{isFolder ? 'New folder' : 'New Markdown file'}</DialogTitle>
            <Box component="form" onSubmit={handleSubmit}>
                <DialogContent>
                    <TextField
                        autoFocus
                        disabled={isCreating}
                        fullWidth
                        helperText={`Location: ${parentDirectory || '.'}`}
                        label={isFolder ? 'Folder name' : 'File name'}
                        margin="dense"
                        onChange={handleNameChange}
                        value={name}
                    />
                </DialogContent>
                <DialogActions>
                    <Button disabled={isCreating} onClick={onClose}>Cancel</Button>
                    <Button disabled={isCreating || name.trim().length === 0} type="submit" variant="contained">Create</Button>
                </DialogActions>
            </Box>
        </Dialog>
    )
}
