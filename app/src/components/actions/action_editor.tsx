import { Alert, Box, Button, FormHelperText, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import {
    actionService,
    editableActionDefinition,
} from '../../services/action_service'
import { dialogService } from '../../services/dialog_service'
import { MarkdownEditor, type MarkdownEditorHandle } from '../editor/markdown_editor'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { useWorktrees } from '../hooks/use_worktrees'
import { ActionDefinitionFields } from './action_definition_fields'
import { ActionPhraseToolbarControls } from './action_phrase_toolbar_controls'
import { actionPhraseLabel } from './action_phrase_label'

const AUTO_SAVE_DELAY_MS = 500
const DEFINITION_TAB = 'definition'
const PROMPT_TAB = 'prompt'
const PHRASE_TAB_PREFIX = 'phrase-'
export const DEFAULT_ACTION_EDITOR_TAB = DEFINITION_TAB

interface ActionEditorProps {
    action: ActionDefinition
    actions: ActionDefinition[]
    cardTypes: string[]
    onSelectedTabChange?: (selectedTab: string) => void
    repositoryFiles: string[]
    selectedTab?: string
    specialContextTypes: string[]
    states: string[]
}

interface ActionDraftState {
    definition: RawActionDefinition
    revision: number
    savedRevision: number
}

function phraseTabValue(index: number) {
    return `${PHRASE_TAB_PREFIX}${index}`
}

export function ActionEditor(props: ActionEditorProps) {
    const {
        action, actions, cardTypes, onSelectedTabChange, repositoryFiles,
        selectedTab: storedSelectedTab, specialContextTypes, states,
    } = props
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
    const [localSelectedTab, setLocalSelectedTab] = useState(storedSelectedTab ?? DEFINITION_TAB)
    const selectedTab = storedSelectedTab ?? localSelectedTab
    const [markdownHistoryStore] = useState(() => new MarkdownDocumentHistoryStore())
    const markdownEditorRef = useRef<MarkdownEditorHandle>(null)

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

    const selectedPhraseIndex = selectedTab.startsWith(PHRASE_TAB_PREFIX)
        ? Number(selectedTab.slice(PHRASE_TAB_PREFIX.length))
        : null
    const selectedPhrase = selectedPhraseIndex === null ? null : definition.phrases?.[selectedPhraseIndex] ?? null
    const activeTab = selectedPhraseIndex !== null && !selectedPhrase ? PROMPT_TAB : selectedTab
    const markdownDocumentId = selectedPhraseIndex !== null && selectedPhrase ? phraseTabValue(selectedPhraseIndex) : PROMPT_TAB
    const markdown = selectedPhrase?.text ?? definition.prompt ?? ''

    useEffect(() => {
        const phraseDocumentIds = (definition.phrases ?? []).map((_phrase, index) => phraseTabValue(index))
        markdownHistoryStore.retainDocuments([PROMPT_TAB, ...phraseDocumentIds])
    }, [definition.phrases, markdownHistoryStore])

    const handleAddPhrase = () => {
        const phrases = definition.phrases ?? []
        setDraft((current) => ({
            ...current,
            definition: { ...current.definition, phrases: [...phrases, { text: '', title: '' }] },
            revision: current.revision + 1,
        }))
        const nextTab = phraseTabValue(phrases.length)
        setLocalSelectedTab(nextTab)
        onSelectedTabChange?.(nextTab)
    }

    const handleTabChange = (_event: SyntheticEvent, value: string) => {
        if (value === 'add-phrase') {
            handleAddPhrase()
            return
        }
        setLocalSelectedTab(value)
        onSelectedTabChange?.(value)
    }

    const handleMarkdownChange = (documentId: string, text: string) => {
        if (documentId === PROMPT_TAB) {
            setDraft((current) => ({
                ...current,
                definition: { ...current.definition, prompt: text },
                revision: current.revision + 1,
            }))
            return
        }
        if (!documentId.startsWith(PHRASE_TAB_PREFIX)) throw new Error(`Unknown action Markdown document: ${documentId}`)
        const phraseIndex = Number(documentId.slice(PHRASE_TAB_PREFIX.length))
        setDraft((current) => ({
            ...current,
            definition: {
                ...current.definition,
                phrases: (current.definition.phrases ?? []).map((phrase, index) => (
                    index === phraseIndex ? { ...phrase, text } : phrase
                )),
            },
            revision: current.revision + 1,
        }))
    }

    const handlePhraseTitleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        if (selectedPhraseIndex === null) return
        const title = event.target.value
        setDraft((current) => ({
            ...current,
            definition: {
                ...current.definition,
                phrases: (current.definition.phrases ?? []).map((phrase, index) => (
                    index === selectedPhraseIndex ? { ...phrase, title } : phrase
                )),
            },
            revision: current.revision + 1,
        }))
    }, [selectedPhraseIndex])

    const handleDeletePhrase = useCallback(() => {
        if (selectedPhraseIndex === null) return
        markdownEditorRef.current?.setMarkdown(selectedPhrase?.text ?? '')
        setDraft((current) => ({
            ...current,
            definition: {
                ...current.definition,
                phrases: (current.definition.phrases ?? []).filter((_phrase, index) => index !== selectedPhraseIndex),
            },
            revision: current.revision + 1,
        }))
        setLocalSelectedTab(PROMPT_TAB)
        onSelectedTabChange?.(PROMPT_TAB)
    }, [onSelectedTabChange, selectedPhrase, selectedPhraseIndex])

    const phraseToolbarContents = useCallback(() => {
        if (!selectedPhrase) throw new Error('Missing selected phrase')

        return (
            <ActionPhraseToolbarControls
                onDelete={handleDeletePhrase}
                onTitleChange={handlePhraseTitleChange}
                title={selectedPhrase.title}
            />
        )
    }, [handleDeletePhrase, handlePhraseTitleChange, selectedPhrase])

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
    const canRetry = !!saveError && validation.valid && dirty && !conflict && !saving
    const handleRetry = () => {
        if (!canRetry) return
        runSave(definition, revision, true)
    }
    const status = saving
        ? 'Saving…'
        : saveError
            ? 'Save failed. Retry to save changes.'
            : validation.valid
                ? null
                : 'Fix validation errors to save.'

    return (
        <Box data-testid="action-editor" sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
            <Box data-testid="action-editor-content" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
                {saveError ? (
                    <Alert
                        action={<Button color="inherit" disabled={!canRetry} onClick={handleRetry} size="small">Retry save</Button>}
                        severity="error"
                        sx={{ mb: 2 }}
                    >
                        {saveError}
                    </Alert>
                ) : null}
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
                {definition.type === 'agent' ? (
                    <>
                        {activeTab === DEFINITION_TAB ? (
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
                        ) : null}
                        <Box hidden={activeTab === DEFINITION_TAB} sx={{ minHeight: '100%' }}>
                            {selectedPhrase && errors.phrases ? <FormHelperText error>{errors.phrases}</FormHelperText> : null}
                            {!selectedPhrase && errors.prompt ? <FormHelperText error>{errors.prompt}</FormHelperText> : null}
                            <MarkdownEditor
                                documentId={markdownDocumentId}
                                historyStore={markdownHistoryStore}
                                markdown={markdown}
                                onDocumentChange={handleMarkdownChange}
                                placeholders={selectedPhrase ? undefined : ACTION_PROMPT_PLACEHOLDERS}
                                ref={markdownEditorRef}
                                toolbarContents={selectedPhrase ? phraseToolbarContents : undefined}
                            />
                        </Box>
                    </>
                ) : (
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
                )}
                {status ? (
                    <Typography color={validation.valid ? 'text.secondary' : 'error'} sx={{ mt: 1 }} variant="caption">
                        {status}
                    </Typography>
                ) : null}
            </Box>
            {definition.type === 'agent' ? (
                <Tabs
                    aria-label="Action editor sections"
                    onChange={handleTabChange}
                    scrollButtons="auto"
                    sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0 }}
                    value={activeTab}
                    variant="scrollable"
                >
                    <Tab label="Definition" value={DEFINITION_TAB} />
                    <Tab label="Prompt" value={PROMPT_TAB} />
                    {(definition.phrases ?? []).map((phrase, index) => (
                        <Tab
                            key={phraseTabValue(index)}
                            label={actionPhraseLabel(phrase.title, phrase.text)}
                            value={phraseTabValue(index)}
                        />
                    ))}
                    <Tab aria-label="Add predefined phrase" label="+" value="add-phrase" />
                </Tabs>
            ) : null}
        </Box>
    )
}
