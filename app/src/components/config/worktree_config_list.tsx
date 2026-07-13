import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import Plus from 'mdi-material-ui/Plus'
import { useWorktreeDraft } from '../hooks/use_worktrees'
import { dialogService } from '../../services/dialog_service'
import { worktreeService } from '../../services/worktree_service'
import { WorktreeConfigRow } from './worktree_config_row'

export function WorktreeConfigList() {
    const draft = useWorktreeDraft()

    const handleAdd = async () => {
        try {
            await worktreeService.addDraft()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Worktree registration failed' })
        }
    }

    const handleRemove = (index: number) => {
        worktreeService.removeDraft(index)
    }

    if (!draft) return null

    return (
        <Stack aria-label="Configured worktrees" spacing={1.25}>
            <Box>
                <Typography component="h3" variant="h6">Linked worktrees</Typography>
                <Typography color="text.secondary" variant="body2">
                    Registered folders only. Removing one does not delete its folder or Git branch.
                </Typography>
            </Box>
            {draft.map((record, index) => (
                <WorktreeConfigRow index={index} key={`${index}-${record.path}`} onRemove={handleRemove} record={record} />
            ))}
            <Tooltip title="Register linked worktree">
                <IconButton aria-label="Register linked worktree" onClick={handleAdd} size="small" sx={{ alignSelf: 'flex-start' }}>
                    <Plus />
                </IconButton>
            </Tooltip>
        </Stack>
    )
}
