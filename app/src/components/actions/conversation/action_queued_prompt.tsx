import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import { Box, Button, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { useState } from 'react'
import type { ActionQueuedPrompt } from '../../../data/action_run_types'
import {
    deleteActionQueuedPrompt,
    editActionQueuedPrompt,
} from '../../../services/actions/action_run_registry'
import { dialogService } from '../../../services/dialog_service'

interface ActionQueuedPromptProps {
    entry: ActionQueuedPrompt
    runId: string
}

/** Editable prompt accepted for later delivery to active agent. */
export function ActionQueuedPromptRow({ entry, runId }: ActionQueuedPromptProps) {
    const [editing, setEditing] = useState(false)
    const [editValue, setEditValue] = useState(entry.content)
    const [saving, setSaving] = useState(false)

    const handleEdit = () => {
        setEditValue(entry.content)
        setEditing(true)
    }
    const handleCancelEdit = () => {
        setEditValue(entry.content)
        setEditing(false)
    }
    const handleSave = async () => {
        if (editValue.trim().length === 0) {
            dialogService.warning('Queued agent prompt cannot be empty')
            return
        }

        setSaving(true)
        try {
            await editActionQueuedPrompt(runId, entry.id, entry.revision, editValue)
            setEditing(false)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not edit queued agent prompt' })
        } finally {
            setSaving(false)
        }
    }
    const handleDelete = async () => {
        try {
            await deleteActionQueuedPrompt(runId, entry.id, entry.revision)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not delete queued agent prompt' })
        }
    }

    return (
        <Box
            aria-label="Queued prompt"
            sx={{
                alignSelf: 'flex-end', bgcolor: 'background.paper', border: 1, borderColor: 'divider',
                borderRadius: 1, flexShrink: 0, maxWidth: '88%', minWidth: 0, overflowWrap: 'anywhere',
                px: 1.25, py: 1,
            }}
        >
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Typography color="text.secondary" sx={{ flex: 1 }} variant="caption">Queued</Typography>
                {!editing ? (
                    <>
                        <Tooltip title="Edit queued prompt">
                            <IconButton aria-label="Edit queued prompt" onClick={handleEdit} size="small">
                                <EditOutlined sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete queued prompt">
                            <IconButton aria-label="Delete queued prompt" onClick={handleDelete} size="small">
                                <DeleteOutlineOutlined sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </>
                ) : null}
            </Stack>
            {editing ? (
                <Stack spacing={1}>
                    <TextField
                        autoFocus
                        disabled={saving}
                        multiline
                        onChange={(event) => setEditValue(event.target.value)}
                        size="small"
                        slotProps={{ htmlInput: { 'aria-label': 'Queued prompt content' } }}
                        value={editValue}
                    />
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        <Button disabled={saving} onClick={handleCancelEdit} size="small" variant="outlined">Cancel</Button>
                        <Button disabled={saving} onClick={handleSave} size="small" variant="contained">Save</Button>
                    </Stack>
                </Stack>
            ) : (
                <Typography sx={{ whiteSpace: 'pre-wrap' }} variant="body2">{entry.content}</Typography>
            )}
        </Box>
    )
}
