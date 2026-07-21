import { Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import Plus from 'mdi-material-ui/Plus'
import { useState } from 'react'
import type { WorktreeRecord } from '../../data/data_types'
import { useWorktreeAdding, useWorktrees } from '../hooks/use_worktrees'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/project/worktree_service'
import { WorktreeConfigRow } from './worktree_config_row'
import { WorktreeRemoveDialog } from './worktree_remove_dialog'

export function WorktreeConfigList() {
    const worktrees = useWorktrees()
    const isAdding = useWorktreeAdding()
    const [removeRecord, setRemoveRecord] = useState<WorktreeRecord | null>(null)

    const handleAdd = async () => {
        try {
            await worktreeService.add()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Worktree creation failed' })
        }
    }

    const handleRemove = (index: number) => {
        const record = worktrees[index]
        if (!record) throw new Error(`Invalid worktree list index: ${index}`)

        setRemoveRecord(record)
    }

    const handleRemoveClose = () => {
        setRemoveRecord(null)
    }

    const handleRemoveConfirm = async () => {
        if (!removeRecord) throw new Error('Missing worktree removal target')
        const index = worktrees.findIndex(({ path }) => path === removeRecord.path)
        if (index === -1) throw new Error('Worktree removal target no longer exists')

        try {
            await worktreeService.remove(index)
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
                    Add chooses an empty folder. Removing a worktree deletes its checkout folder but keeps its branch.
                </Typography>
            </Box>
            {worktrees.map((record, index) => (
                <WorktreeConfigRow index={index} key={`${index}-${record.path}`} onRemove={handleRemove} record={record} />
            ))}
            <Tooltip title="Add linked worktree">
                <IconButton aria-label="Add linked worktree" disabled={isAdding} onClick={handleAdd} size="small" sx={{ alignSelf: 'flex-start' }}>
                    {isAdding ? <CircularProgress aria-label="Creating linked worktree" size={24} /> : <Plus />}
                </IconButton>
            </Tooltip>
            <WorktreeRemoveDialog onClose={handleRemoveClose} onConfirm={handleRemoveConfirm} record={removeRecord} />
        </Stack>
    )
}
