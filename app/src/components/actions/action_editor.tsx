import { Alert, Box, Button, FormHelperText, Stack, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import {
    actionService,
    editableActionDefinition,
} from '../../services/action_service'
import { dialogService } from '../../services/dialog_service'
import { MarkdownEditor } from '../editor/markdown_editor'
import { useWorktrees } from '../hooks/use_worktrees'
import { ActionDefinitionFields } from './action_definition_fields'

const AUTO_SAVE_DELAY_MS = 500

interface ActionEditorProps {
    action: ActionDefinition
    actions: ActionDefinition[]
    cardTypes: string[]
    repositoryFiles: string[]
    specialContextTypes: string[]
    states: string[]
}

interface ActionDraftState {
    definition: RawActionDefinition
    revision: number
    savedRevision: number
}

export function ActionEditor(props: ActionEditorProps) {
    const { action, actions, cardTypes, repositoryFiles, specialContextTypes, states } = props
    const worktrees = useWorktrees()
    const sourcePath = action.sourcePath
    if (!sourcePath) throw new Error(`Action editor requires a persisted action: ${action.id}`)

    const initialExternalDefinition = actionService.getDefinitionByPath(sourcePath)
    if (!initialExternalDefinition) throw new Error(`Missing action definition for editor: ${sourcePath}`)

    const [draft, setDraft] = useState<ActionDraftState>(() => ({
        definition: editableActionDefinition(action),
        revision: 0,
        savedRevision: 0,
    }))
    const { definition, revision, savedRevision } = draft
    // Last service-owned definition reconciled into this editor.
    const externalDefinitionRef = useRef(initialExternalDefinition)
    // Structured draft objects issued by this editor, used to recognise service save echoes.
    const ownDefinitionsRef = useRef(new Set<RawActionDefinition>())
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
    // Definition/file/cycle errors have no single field; surface them in a general summary.
    const generalError = !validation.valid && !validation.field ? validation.error : null

    const dirty = revision !== savedRevision

    const runSave = useCallback((snapshot: RawActionDefinition, snapshotRevision: number, track: boolean) => {
        const seq = ++issuedRef.current
        // Record saved object so resulting prop update is recognised as our own echo,
        // not an external conflict.
        ownDefinitionsRef.current.add(snapshot)
        if (track) {
            setPendingCount((current) => current + 1)
            setSaveError(null)
        }
        chainRef.current = chainRef.current.then(async () => {
            try {
                await actionService.saveDefinition(sourcePath, snapshot)
                // Chain preserves issue order; never move saved revision backwards.
                setDraft((current) => ({
                    ...current,
                    savedRevision: Math.max(current.savedRevision, snapshotRevision),
                }))
            } catch (error) {
                ownDefinitionsRef.current.delete(snapshot)
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
        if (!validation.valid || !dirty || conflict) return undefined

        const snapshot = definition
        const timeout = window.setTimeout(() => runSave(snapshot, revision, true), AUTO_SAVE_DELAY_MS)

        return () => window.clearTimeout(timeout)
    }, [conflict, definition, dirty, revision, runSave, validation.valid])

    // Reconcile external `action` changes without clobbering an in-flight draft.
    useEffect(() => {
        const externalDefinition = actionService.getDefinitionByPath(sourcePath)
        if (!externalDefinition) throw new Error(`Missing external action definition: ${sourcePath}`)
        if (externalDefinition === externalDefinitionRef.current) return
        externalDefinitionRef.current = externalDefinition

        if (ownDefinitionsRef.current.has(externalDefinition)) {
            ownDefinitionsRef.current.delete(externalDefinition)

            return
        }
        if (!dirty) {
            // Draft is clean: adopt the external version.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDraft((current) => {
                const nextRevision = current.revision + 1

                return { definition: externalDefinition, revision: nextRevision, savedRevision: nextRevision }
            })
        } else {
            // Draft is dirty: surface a conflict, keep the local draft.
            setConflict(externalDefinition)
        }
    }, [action, dirty, sourcePath])

    // Flush a pending valid dirty draft when the editor unmounts (tab switch / close).
    const flushStateRef = useRef({ definition, dirty, revision, runSave, valid: validation.valid })
    useEffect(() => {
        flushStateRef.current = { definition, dirty, revision, runSave, valid: validation.valid }
    })
    useEffect(() => () => {
        const flush = flushStateRef.current
        if (!flush.valid || !flush.dirty) return
        flush.runSave(flush.definition, flush.revision, false)
    }, [])

    const handleDefinitionChange = (nextDefinition: RawActionDefinition) => {
        setDraft((current) => ({ ...current, definition: nextDefinition, revision: current.revision + 1 }))
    }

    const handlePromptChange = (prompt: string) => {
        setDraft((current) => ({
            ...current,
            definition: { ...current.definition, prompt },
            revision: current.revision + 1,
        }))
    }

    const handleKeepMine = () => {
        // Keep local draft dirty so it re-saves over external version.
        setConflict(null)
    }

    const handleReloadExternal = () => {
        if (!conflict) return
        setDraft((current) => {
            const nextRevision = current.revision + 1

            return { definition: conflict, revision: nextRevision, savedRevision: nextRevision }
        })
        setConflict(null)
    }

    const selectableActions = actions.filter(({ id }) => id !== action.id)
    const saving = pendingCount > 0
    const status = saving ? 'Saving…' : validation.valid ? 'Changes save automatically.' : 'Fix validation errors to save.'

    return (
        <Box>
            {saveError ? <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert> : null}
            {generalError ? <Alert severity="error" sx={{ mb: 2 }}>{generalError}</Alert> : null}
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
                cardTypes={cardTypes}
                definition={definition}
                errorIndex={validation.index}
                errors={errors}
                onChange={handleDefinitionChange}
                repositoryFiles={repositoryFiles}
                specialContextTypes={specialContextTypes}
                states={states}
                worktrees={worktrees}
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
