import BuildOutlined from '@mui/icons-material/BuildOutlined'
import SmartToyOutlined from '@mui/icons-material/SmartToyOutlined'
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Stack,
    Tooltip,
    Typography,
} from '@mui/material'
import type { MouseEvent } from 'react'
import type { ActionDefinition } from '../data/action_types'
import { dialogService } from '../services/dialog_service'
import {
    mergeConflictService,
    type MergeConflictService,
} from '../services/project/merge_conflict_service'
import { useMergeConflict } from './hooks/use_merge_conflict'
import { useActions } from './hooks/use_actions'

interface MergeConflictDialogProps {
    actions?: ActionDefinition[]
    service?: MergeConflictService
}

/** Global resolver for one desktop-owned paused Git conflict session. */
export function MergeConflictDialog(props: MergeConflictDialogProps) {
    const service = props.service ?? mergeConflictService
    const { busy, session } = useMergeConflict(service)
    const actionState = useActions()
    const actions = (props.actions ?? actionState.actions).filter((action) => (
        action.type === 'agent' && action.appliesTo?.kind === 'merge-conflict'
    ))
    const paths = session?.conflictedPaths ?? []
    const resolverConfigured = session?.externalResolverConfigured ?? false

    const handleResolver = async (event: MouseEvent<HTMLButtonElement>) => {
        const path = event.currentTarget.dataset.path
        if (!path) return
        try {
            await service.launchResolver(path)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Could not open merge conflict resolver for ${path}` })
        }
    }

    const handleMarkResolved = async (event: MouseEvent<HTMLButtonElement>) => {
        const path = event.currentTarget.dataset.path
        if (!path) return
        try {
            await service.markResolved(path)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Could not mark merge conflict resolved: ${path}` })
        }
    }

    const handleAgent = async (event: MouseEvent<HTMLButtonElement>) => {
        const actionId = event.currentTarget.dataset.actionId
        const path = event.currentTarget.dataset.path
        const action = actions.find((candidate) => candidate.id === actionId)
        if (!action) return
        try {
            await service.runAgent(action, path)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Merge conflict agent failed: ${action.label}` })
        }
    }

    const handleContinue = async () => {
        try {
            await service.continue()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not continue paused Git operation' })
        }
    }

    const handleCancel = async () => {
        try {
            await service.abort()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Could not abort paused Git operation' })
        }
    }

    const handleDialogClose = () => {
        if (!busy) void handleCancel()
    }

    return (
        <Dialog
            fullWidth
            maxWidth="md"
            onClose={handleDialogClose}
            open={!!session}
            slotProps={{ paper: { sx: { display: 'flex', maxHeight: '80vh' } } }}
        >
            <DialogTitle>Resolve merge conflicts</DialogTitle>
            <DialogContent dividers sx={{ minHeight: 0, overflowY: 'auto', py: 2 }}>
                <Stack spacing={2}>
                    <Typography color="text.secondary">
                        Resolve each file, stage it with Mark resolved, then continue {session?.operation ?? 'Git operation'}.
                    </Typography>
                    {!resolverConfigured ? (
                        <Alert severity="info">
                            External resolver disabled. Configure Desktop / Merge conflict resolver command to enable it.
                        </Alert>
                    ) : null}
                    {paths.map((path) => (
                        <Box
                            key={path}
                            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}
                        >
                            <Stack spacing={1.5}>
                                <Box sx={{ alignItems: 'center', display: 'flex', gap: 1, minWidth: 0 }}>
                                    <Typography sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{path}</Typography>
                                    <Typography color="error.main" variant="caption">Unresolved</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                    <Tooltip title={resolverConfigured ? `Open ${path} in external resolver` : 'Configure merge conflict resolver command first'}>
                                        <span>
                                            <Button
                                                data-path={path}
                                                disabled={busy || !resolverConfigured}
                                                onClick={handleResolver}
                                                size="small"
                                                startIcon={<BuildOutlined />}
                                                variant="outlined"
                                            >
                                                External resolver
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    {actions.map((action) => (
                                        <Button
                                            data-action-id={action.id}
                                            data-path={path}
                                            disabled={busy}
                                            key={action.id}
                                            onClick={handleAgent}
                                            size="small"
                                            startIcon={<SmartToyOutlined />}
                                            variant="outlined"
                                        >
                                            {action.label}
                                        </Button>
                                    ))}
                                    <Button
                                        data-path={path}
                                        disabled={busy}
                                        onClick={handleMarkResolved}
                                        size="small"
                                        variant="contained"
                                    >
                                        Mark resolved
                                    </Button>
                                </Box>
                            </Stack>
                        </Box>
                    ))}
                    {actions.length > 0 && paths.length > 0 ? (
                        <>
                            <Divider />
                            <Stack spacing={1}>
                                <Typography variant="overline">Resolve all remaining files with agent</Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                    {actions.map((action) => (
                                        <Button
                                            data-action-id={action.id}
                                            disabled={busy}
                                            key={action.id}
                                            onClick={handleAgent}
                                            startIcon={<SmartToyOutlined />}
                                            variant="outlined"
                                        >
                                            {action.label}
                                        </Button>
                                    ))}
                                </Box>
                            </Stack>
                        </>
                    ) : null}
                    {paths.length === 0 ? <Alert severity="success">All conflict entries are staged. Continue when ready.</Alert> : null}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid', borderColor: 'divider', justifyContent: 'flex-end' }}>
                <Button disabled={busy} onClick={handleCancel} variant="outlined">Cancel</Button>
                <Button disabled={busy || paths.length > 0} onClick={handleContinue} variant="contained">Continue</Button>
            </DialogActions>
        </Dialog>
    )
}
