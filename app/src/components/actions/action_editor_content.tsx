import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { actionService } from '../../services/actions/action_service'
import { dialogService } from '../../services/dialog_service'
import { openFilesService } from '../../services/open_files_service'
import { useWorktrees } from '../hooks/use_worktrees'
import { ActionDefinitionFields } from './action_definition_fields'
import { ACTION_DEFINITION_TAB } from './action_phrase_editor_state'
import { useRetainedAction } from './use_retained_action'

interface ActionEditorContentProps {
    cardTypes: string[]
    repositoryFiles: string[]
    specialContextTypes: string[]
    states: string[]
}

/** Definition and recovery region backed directly by ActionService. */
export function ActionEditorContent(props: ActionEditorContentProps) {
    const { cardTypes, repositoryFiles, specialContextTypes, states } = props
    const action = useRetainedAction()
    const sourcePath = action.sourcePath
    if (!sourcePath) throw new Error(`Action editor requires a persisted action: ${action.id}`)
    const [, setRevision] = useState(0)
    useEffect(() => {
        const handleChanged = () => setRevision((current) => current + 1)
        actionService.addEventListener('changed', handleChanged)

        return () => actionService.removeEventListener('changed', handleChanged)
    }, [])
    const draft = actionService.getDraft(sourcePath)
    const { conflict, definition, deleted, error: saveError, saving, validation } = draft
    const activeTab = (actionService.getActionByPath(sourcePath) ?? action).editorState?.selectedTab ?? ACTION_DEFINITION_TAB
    const canRetry = !!saveError && validation.valid && draft.revision !== draft.savedRevision && !conflict && !saving
    const status = saveError ? 'Save failed. Retry to save changes.' : validation.valid ? null : 'Fix validation errors to save.'
    const showActionContent = definition.type !== 'agent' || activeTab === ACTION_DEFINITION_TAB || !!saveError || deleted || !!conflict
    const worktrees = useWorktrees()

    useEffect(() => {
        if (validation.error) dialogService.error(validation.error, { title: 'Invalid action' })
    }, [validation.error])
    const handleRetry = () => actionService.retryDraft(sourcePath)
    const handleRecreateDeleted = () => actionService.recreateDeletedDraft(sourcePath)
    const handleDiscardDeleted = () => {
        actionService.discardDeletedDraft(sourcePath)
        const document = openFilesService.getSnapshot().documents.find((candidate) => (
            candidate.kind === 'action' && candidate.getObject().id === action.id
        ))
        if (document) openFilesService.closeDocument(document)
    }
    const handleKeepMine = () => actionService.keepDraft(sourcePath)
    const handleReloadExternal = () => actionService.reloadDraft(sourcePath)

    return (
        <Box
            data-testid="action-editor-content"
            hidden={!showActionContent}
            sx={{ flex: activeTab === ACTION_DEFINITION_TAB || definition.type !== 'agent' ? 1 : '0 0 auto', minHeight: 0, order: 1, overflowY: 'auto', p: 2 }}
        >
            {saveError ? (
                <Alert action={<Button color="inherit" disabled={!canRetry} onClick={handleRetry} size="small">Retry save</Button>} severity="error" sx={{ mb: 2 }}>
                    {saveError}
                </Alert>
            ) : null}
            {deleted ? (
                <Alert
                    action={(
                        <Stack direction="row" spacing={1}>
                            <Button color="inherit" disabled={!validation.valid || saving} onClick={handleRecreateDeleted} size="small">Recreate file</Button>
                            <Button color="inherit" onClick={handleDiscardDeleted} size="small">Discard draft</Button>
                        </Stack>
                    )}
                    severity="warning"
                    sx={{ mb: 2 }}
                >
                    This action file was deleted outside the editor. Recreate it or discard this draft.
                </Alert>
            ) : null}
            {conflict ? (
                <Alert
                    action={(
                        <Stack direction="row" spacing={1}>
                            <Button color="inherit" onClick={handleKeepMine} size="small">Keep my changes</Button>
                            <Button color="inherit" onClick={handleReloadExternal} size="small">Reload from disk</Button>
                        </Stack>
                    )}
                    severity="warning"
                    sx={{ mb: 2 }}
                >
                    This action was changed outside the editor while you had unsaved edits.
                </Alert>
            ) : null}
            {(definition.type !== 'agent' || activeTab === ACTION_DEFINITION_TAB) ? (
                <ActionDefinitionFields
                    actions={actionService.getActions()}
                    cardTypes={cardTypes}
                    repositoryFiles={repositoryFiles}
                    sourcePath={sourcePath}
                    specialContextTypes={specialContextTypes}
                    states={states}
                    worktrees={worktrees}
                />
            ) : null}
            {status && (definition.type !== 'agent' || activeTab === ACTION_DEFINITION_TAB) ? (
                <Typography color={validation.valid ? 'text.secondary' : 'error'} sx={{ mt: 1 }} variant="caption">{status}</Typography>
            ) : null}
        </Box>
    )
}
