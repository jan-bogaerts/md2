import { Alert, Box, Button, FormHelperText, Stack, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import {
    actionService,
    editableActionDefinition,
    serializeActionDefinition,
} from '../../services/action_service'
import { dialogService } from '../../services/dialog_service'
import { MarkdownEditor } from '../editor/markdown_editor'
import { ActionDefinitionFields } from './action_definition_fields'

const AUTO_SAVE_DELAY_MS = 500

interface ActionEditorProps {
    action: ActionDefinition
    actions: ActionDefinition[]
    repositoryFiles: string[]
    states: string[]
}

export function ActionEditor(props: ActionEditorProps) {
    const { action, actions, repositoryFiles, states } = props
    const sourcePath = action.sourcePath
    if (!sourcePath) throw new Error(`Action editor requires a persisted action: ${action.id}`)

    const [definition, setDefinition] = useState<RawActionDefinition>(() => editableActionDefinition(action))
    // Content that is (or is being reconciled as) persisted for the mounted action.
    const [baseline, setBaseline] = useState(() => serializeActionDefinition(definition))
    // Last external `action` prop content we have already reconciled into the draft.
    const externalBaselineRef = useRef(serializeActionDefinition(editableActionDefinition(action)))
    // Serialized contents this editor issued saves for, used to recognise our own save echo.
    const ownContentsRef = useRef(new Set<string>())
    // Serializes persistence per action path and orders completions.
    const chainRef = useRef<Promise<void>>(Promise.resolve())
    const issuedRef = useRef(0)
    const [pendingCount, setPendingCount] = useState(0)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [conflict, setConflict] = useState<RawActionDefinition | null>(null)

    const validation = useMemo(
        () => actionService.validateDefinition(sourcePath, definition),
        [definition, sourcePath],
    )
    const errors = useMemo(() => (
        validation.error && validation.field ? { [validation.field]: validation.error } : {}
    ), [validation.error, validation.field])

    const content = serializeActionDefinition(definition)
    const dirty = content !== baseline

    const runSave = useCallback((snapshot: RawActionDefinition, snapshotContent: string, track: boolean) => {
        const seq = ++issuedRef.current
        // Record the saved content so the resulting prop update is recognised as our own echo,
        // not an external conflict.
        ownContentsRef.current.add(snapshotContent)
        if (track) {
            setPendingCount((current) => current + 1)
            setSaveError(null)
        }
        chainRef.current = chainRef.current.then(async () => {
            try {
                await actionService.saveDefinition(sourcePath, snapshot)
                // Chain preserves issue order, so the newest completion sets the baseline last.
                setBaseline(snapshotContent)
            } catch (error) {
                // A stale completion (superseded by a newer save) must not surface as the status.
                if (track && seq === issuedRef.current) {
                    const message = error instanceof Error ? error.message : 'Action save failed'
                    setSaveError(message)
                    dialogService.error(error, { fallbackMessage: message })
                }
            } finally {
                if (track) setPendingCount((current) => current - 1)
            }
        })
    }, [sourcePath])

    // Debounced auto-save of the newest valid dirty draft.
    useEffect(() => {
        if (!validation.valid || !dirty) return undefined

        const snapshot = definition
        const timeout = window.setTimeout(() => runSave(snapshot, content, true), AUTO_SAVE_DELAY_MS)

        return () => window.clearTimeout(timeout)
    }, [content, definition, dirty, runSave, validation.valid])

    // Reconcile external `action` changes without clobbering an in-flight draft.
    useEffect(() => {
        const external = serializeActionDefinition(editableActionDefinition(action))
        if (external === externalBaselineRef.current) return
        externalBaselineRef.current = external

        if (ownContentsRef.current.has(external)) {
            ownContentsRef.current.delete(external)
            setBaseline(external)

            return
        }
        if (serializeActionDefinition(definition) === baseline) {
            // Draft is clean: adopt the external version.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDefinition(editableActionDefinition(action))
            setBaseline(external)
        } else {
            // Draft is dirty: surface a conflict, keep the local draft.
            setConflict(editableActionDefinition(action))
        }
    }, [action, baseline, definition])

    // Flush a pending valid dirty draft when the editor unmounts (tab switch / close).
    const flushStateRef = useRef({ content, definition, dirty, runSave, valid: validation.valid })
    useEffect(() => {
        flushStateRef.current = { content, definition, dirty, runSave, valid: validation.valid }
    })
    useEffect(() => () => {
        const flush = flushStateRef.current
        if (!flush.valid || !flush.dirty) return
        flush.runSave(flush.definition, flush.content, false)
    }, [])

    const handleDefinitionChange = (nextDefinition: RawActionDefinition) => {
        setDefinition(nextDefinition)
    }

    const handlePromptChange = (prompt: string) => {
        setDefinition((current) => ({ ...current, prompt }))
    }

    const handleKeepMine = () => {
        // Keep the local draft; baseline stays on the older persisted content so the draft re-saves over the external version.
        setConflict(null)
    }

    const handleReloadExternal = () => {
        if (!conflict) return
        setDefinition(conflict)
        setBaseline(serializeActionDefinition(conflict))
        setConflict(null)
    }

    const selectableActions = actions.filter(({ id }) => id !== action.id)
    const saving = pendingCount > 0
    const status = saving ? 'Saving…' : validation.valid ? 'Changes save automatically.' : 'Fix validation errors to save.'

    return (
        <Box>
            {saveError ? <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert> : null}
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
            <ActionDefinitionFields
                actions={selectableActions}
                definition={definition}
                errors={errors}
                onChange={handleDefinitionChange}
                repositoryFiles={repositoryFiles}
                states={states}
            />
            {definition.type === 'agent' ? (
                <Box>
                    <Typography component="h2" sx={{ mb: 1 }} variant="h6">Prompt</Typography>
                    {errors.prompt ? <FormHelperText error>{errors.prompt}</FormHelperText> : null}
                    <MarkdownEditor key={action.id} markdown={definition.prompt ?? ''} onChange={handlePromptChange} />
                </Box>
            ) : null}
            <Typography color={validation.valid ? 'text.secondary' : 'error'} sx={{ mt: 1 }} variant="caption">
                {status}
            </Typography>
        </Box>
    )
}
