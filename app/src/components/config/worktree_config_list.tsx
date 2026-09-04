import { Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import Plus from 'mdi-material-ui/Plus'
import { useState } from 'react'
import type { WorktreeRecord, WorktreeRemovalMode } from '../../data/data_types'
import { useWorktreeAdding, useWorktreeDraft } from '../hooks/use_worktrees'
import { dialogService } from '../../services/dialog_service'
import { PrimaryWorktreeSelectionError } from '../../services/project/worktree_errors'
import { worktreeService } from '../../services/project/worktree_service'
import { WorktreeConfigRow } from './worktree_config_row'
import { WorktreeRemoveDialog } from './worktree_remove_dialog'

export function WorktreeConfigList() {
    const draft = useWorktreeDraft()
    const isAdding = useWorktreeAdding()
    const [removeRecord, setRemoveRecord] = useState<WorktreeRecord | null>(null)
    const records = draft?.records ?? []
    const isApplying = draft?.applying ?? false

    const handleAdd = async () => {
        try {
            await worktreeService.selectDraftAddition()
        } catch (error) {
            if (error instanceof PrimaryWorktreeSelectionError) {
                dialogService.displayError(error.message, { title: 'Linked worktree not added' })
                return
            }
            dialogService.error(error, { fallbackMessage: 'Worktree creation failed' })
        }
    }

    const handleRemove = (path: string, pendingAddition: boolean) => {
        try {
            if (pendingAddition) {
                worktreeService.stageDraftRemoval(path)
                return
            }
            const record = records.find((candidate) => candidate.path === path)
            if (!record) throw new Error('Worktree removal target no longer exists')

            setRemoveRecord(record)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Worktree removal could not be opened' })
        }
    }

    const handleRemoveClose = () => {
        setRemoveRecord(null)
    }

    const handleRemoveConfirm = (mode: WorktreeRemovalMode) => {
        try {
            if (!removeRecord) throw new Error('Missing worktree removal target')
            worktreeService.stageDraftRemoval(removeRecord.path, mode)
            setRemoveRecord(null)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Worktree removal failed' })
        }
    }

    return (
        <Stack aria-label="Linked worktrees" spacing={1.25}>
            <Box>
                <Typography component="h3" variant="h6">Linked worktrees</Typography>
                <Typography color="text.secondary" variant="body2">
                    Add chooses an empty folder. Changes are applied to Git only after Save.
                </Typography>
            </Box>
            {records.map((record, index) => (
                <WorktreeConfigRow
                    disabled={isApplying}
                    index={index}
                    key={`${index}-${record.path}`}
                    onRemove={handleRemove}
                    pendingRemoval={draft?.removals.some((removal) => removal.path === record.path)}
                    record={record}
                />
            ))}
            {draft?.additions.map((path, additionIndex) => (
                <WorktreeConfigRow
                    disabled={isApplying}
                    index={records.length + additionIndex}
                    key={path}
                    onRemove={handleRemove}
                    pendingAddition
                    record={{ error: null, path, valid: true }}
                />
            ))}
            <Tooltip title="Add linked worktree">
                <IconButton aria-label="Add linked worktree" disabled={isAdding || isApplying} onClick={handleAdd} size="small" sx={{ alignSelf: 'flex-start' }}>
                    {isAdding ? <CircularProgress aria-label="Selecting linked worktree folder" size={24} /> : <Plus />}
                </IconButton>
            </Tooltip>
            <WorktreeRemoveDialog disabled={isApplying} onClose={handleRemoveClose} onConfirm={handleRemoveConfirm} record={removeRecord} />
        </Stack>
    )
}
