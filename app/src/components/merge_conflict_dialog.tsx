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
import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { actionContextIdentity, type ActionContext } from '../data/action_context'
import type { ActionRunEvent, ActionRunStatus } from '../data/action_run_types'
import type { ActionDefinition } from '../data/action_types'
import { actionRunRegistry, type ActiveActionRun } from '../services/actions/action_run_registry'
import { dialogService } from '../services/dialog_service'
import {
    mergeConflictService,
    type MergeConflictService,
} from '../services/project/merge_conflict_service'
import { useMergeConflict } from './hooks/use_merge_conflict'
import { useActions } from './hooks/use_actions'
import { useRunningActionForContext } from './hooks/use_action_runs'
import { ActionPopup } from './actions/run/popup/action_popup'

interface MergeConflictDialogProps {
    actions?: ActionDefinition[]
    service?: MergeConflictService
}

interface MergeConflictPopupState {
    actionId: string
    anchorElement: HTMLElement
    context: ActionContext
    open: boolean
}

const EMPTY_MERGE_CONFLICT_CONTEXT: ActionContext = { conflictSessionId: '', kind: 'merge-conflict' }
const TERMINAL_ACTION_STATUSES = new Set<ActionRunStatus>(['cancelled', 'completed', 'failed', 'okButNotAfter'])

function isMatchingPopupAction(
    popupState: MergeConflictPopupState | null,
    activeRun: ActiveActionRun | null,
    actionId: string,
    path?: string,
) {
    if (!popupState || popupState.context.conflictFile !== path) return false

    return popupState.actionId === actionId || activeRun?.rootActionId === actionId
}

/** Global resolver for one desktop-owned paused Git conflict session. */
export function MergeConflictDialog(props: MergeConflictDialogProps) {
    const service = props.service ?? mergeConflictService
    const { busy, session } = useMergeConflict(service)
    const [popupState, setPopupState] = useState<MergeConflictPopupState | null>(null)
    const actionState = useActions()
    const actions = (props.actions ?? actionState.actions).filter((action) => (
        action.type === 'agent' && action.appliesTo?.kind === 'merge-conflict'
    ))
    const paths = session?.conflictedPaths ?? []
    const resolverConfigured = session?.externalResolverConfigured ?? false
    const popupContext = popupState?.context ?? null
    const retainedContext = popupContext && popupContext.conflictSessionId === session?.id
        ? popupContext
        : EMPTY_MERGE_CONFLICT_CONTEXT
    const activeRun = useRunningActionForContext(retainedContext)
    const controlsDisabled = busy || !!activeRun

    useEffect(() => {
        const context = popupState?.context
        const sessionId = context?.conflictSessionId
        if (!context || !sessionId) return

        const handleActionEvent = (event: ActionRunEvent) => {
            if (event.type !== 'run' || !TERMINAL_ACTION_STATUSES.has(event.status)) return

            void service.rescanSession(sessionId).catch((error: unknown) => {
                dialogService.error(error, { fallbackMessage: 'Could not rescan merge conflicts after agent action' })
            })
        }

        return actionRunRegistry.subscribeContextEvents(context, handleActionEvent)
    }, [popupState?.context, service])

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

    const handleAgent = (event: MouseEvent<HTMLButtonElement>) => {
        const actionId = event.currentTarget.dataset.actionId
        const path = event.currentTarget.dataset.path
        const action = actions.find((candidate) => candidate.id === actionId)
        if (!action) return
        try {
            const context = service.createActionContext(path)
            const anchorElement = event.currentTarget
            const sameContext = popupState
                && actionContextIdentity(popupState.context) === actionContextIdentity(context)
            if (sameContext && isMatchingPopupAction(popupState, activeRun, action.id, path)) {
                setPopupState({ ...popupState, anchorElement, open: true })
                return
            }

            setPopupState({ actionId: action.id, anchorElement, context, open: true })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Could not open merge conflict action: ${action.label}` })
        }
    }

    const handlePopupClose = () => {
        if (popupState) setPopupState({ ...popupState, open: false })
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
        if (!controlsDisabled) void handleCancel()
    }

    const popup = popupState && popupState.context.conflictSessionId === session?.id ? (
        <ActionPopup
            anchorElement={popupState.anchorElement}
            context={popupState.context}
            draggable
            initialActionId={popupState.actionId}
            onClose={handlePopupClose}
            open={popupState.open}
        />
    ) : null

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
                                                disabled={controlsDisabled || !resolverConfigured}
                                                onClick={handleResolver}
                                                size="small"
                                                startIcon={<BuildOutlined />}
                                                variant="outlined"
                                            >
                                                External resolver
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    {actions.map((action) => {
                                        const matchingActiveAction = isMatchingPopupAction(popupState, activeRun, action.id, path)

                                        return (
                                            <Button
                                                data-action-id={action.id}
                                                data-path={path}
                                                disabled={busy || (!!activeRun && !matchingActiveAction)}
                                                key={action.id}
                                                onClick={handleAgent}
                                                size="small"
                                                startIcon={<SmartToyOutlined />}
                                                variant="outlined"
                                            >
                                                {action.label}
                                            </Button>
                                        )
                                    })}
                                    <Button
                                        data-path={path}
                                        disabled={controlsDisabled}
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
                                    {actions.map((action) => {
                                        const matchingActiveAction = isMatchingPopupAction(popupState, activeRun, action.id)

                                        return (
                                            <Button
                                                data-action-id={action.id}
                                                disabled={busy || (!!activeRun && !matchingActiveAction)}
                                                key={action.id}
                                                onClick={handleAgent}
                                                startIcon={<SmartToyOutlined />}
                                                variant="outlined"
                                            >
                                                {action.label}
                                            </Button>
                                        )
                                    })}
                                </Box>
                            </Stack>
                        </>
                    ) : null}
                    {paths.length === 0 ? <Alert severity="success">All conflict entries are staged. Continue when ready.</Alert> : null}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ borderTop: '1px solid', borderColor: 'divider', justifyContent: 'flex-end' }}>
                <Button disabled={controlsDisabled} onClick={handleCancel} variant="outlined">Cancel</Button>
                <Button disabled={controlsDisabled || paths.length > 0} onClick={handleContinue} variant="contained">Continue</Button>
            </DialogActions>
            {popup}
        </Dialog>
    )
}
