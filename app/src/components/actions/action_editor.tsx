import { Alert, Box, Button, FormHelperText, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type SyntheticEvent } from 'react'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import {
    actionService,
} from '../../services/action_service'
import { MarkdownEditor, type MarkdownEditorHandle } from '../editor/markdown_editor'
import { MarkdownDocumentHistoryStore } from '../editor/markdown_document_history_store'
import { useWorktrees } from '../hooks/use_worktrees'
import { ActionDefinitionFields } from './action_definition_fields'
import { ActionPhraseToolbarControls } from './action_phrase_toolbar_controls'
import { reconcileActionPhraseEditorState } from './action_phrase_editor_state'
import { actionPhraseLabel } from './action_phrase_label'

const DEFINITION_TAB = 'definition'
const PROMPT_TAB = 'prompt'

interface ActionEditorProps {
    action: ActionDefinition
    actions: ActionDefinition[]
    cardTypes: string[]
    repositoryFiles: string[]
    specialContextTypes: string[]
    states: string[]
}

export function ActionEditor(props: ActionEditorProps) {
    const { action, actions, cardTypes, repositoryFiles, specialContextTypes, states } = props
    const worktrees = useWorktrees()
    const sourcePath = action.sourcePath
    if (!sourcePath) throw new Error(`Action editor requires a persisted action: ${action.id}`)

    const [, setServiceRevision] = useState(0)
    useEffect(() => {
        const handleChanged = () => setServiceRevision((current) => current + 1)
        actionService.addEventListener('changed', handleChanged)

        return () => actionService.removeEventListener('changed', handleChanged)
    }, [])
    const draft = actionService.getDraft(sourcePath)
    const { conflict, definition, error: saveError, saving, validation } = draft
    const phrases = useMemo(() => definition.phrases ?? [], [definition.phrases])
    const [editorState, setEditorState] = useState(() => reconcileActionPhraseEditorState(action.editorState, phrases))
    const reconciledEditorState = reconcileActionPhraseEditorState(editorState, phrases)
    if (reconciledEditorState !== editorState) setEditorState(reconciledEditorState)
    const { phrases: phraseEditorStates, selectedTab } = reconciledEditorState
    const [markdownHistoryStore] = useState(() => new MarkdownDocumentHistoryStore())
    const markdownEditorRef = useRef<MarkdownEditorHandle>(null)

    useEffect(() => {
        actionService.setActionEditorState(sourcePath, reconciledEditorState)
    }, [reconciledEditorState, sourcePath])

    const errors = useMemo(() => (
        validation.error && validation.field ? { [validation.field]: validation.error } : {}
    ), [validation.error, validation.field])
    // Definition/file/cycle errors have no single field; surface them in a general summary.
    const generalError = !validation.valid && !validation.field ? validation.error : null

    const handleDefinitionChange = (nextDefinition: RawActionDefinition) => {
        actionService.updateDraft(sourcePath, nextDefinition)
    }

    const selectedPhraseIndex = phraseEditorStates.findIndex(({ identity }) => identity === selectedTab)
    const selectedPhrase = selectedPhraseIndex < 0 ? null : phrases[selectedPhraseIndex]
    const activeTab = selectedTab.startsWith('phrase-') && !selectedPhrase ? PROMPT_TAB : selectedTab
    const markdownDocumentId = selectedPhrase ? selectedTab : PROMPT_TAB
    const markdown = selectedPhrase?.text ?? definition.prompt ?? ''

    useEffect(() => {
        const phraseDocumentIds = phraseEditorStates.map(({ identity }) => identity)
        markdownHistoryStore.retainDocuments([PROMPT_TAB, ...phraseDocumentIds])
    }, [markdownHistoryStore, phraseEditorStates])

    const storeEditorState = useCallback((nextEditorState: typeof editorState) => {
        actionService.setActionEditorState(sourcePath, nextEditorState)
        setEditorState(nextEditorState)
    }, [sourcePath])

    const handleAddPhrase = () => {
        const nextPhrases = [...phrases, { text: '', title: '' }]
        const nextEditorState = reconcileActionPhraseEditorState(editorState, nextPhrases)
        const nextTab = nextEditorState.phrases[nextEditorState.phrases.length - 1].identity
        storeEditorState({ ...nextEditorState, selectedTab: nextTab })
        actionService.updateDraft(sourcePath, { ...definition, phrases: nextPhrases })
    }

    const handleTabChange = (_event: SyntheticEvent, value: string) => {
        if (value === 'add-phrase') {
            handleAddPhrase()
            return
        }
        storeEditorState({ ...editorState, selectedTab: value })
    }

    const handleMarkdownChange = (documentId: string, text: string) => {
        if (documentId === PROMPT_TAB) {
            if (definition.prompt !== text) actionService.updateDraft(sourcePath, { ...definition, prompt: text })
            return
        }
        const phraseIndex = phraseEditorStates.findIndex(({ identity }) => identity === documentId)
        if (phraseIndex < 0) throw new Error(`Unknown action Markdown document: ${documentId}`)
        if (phrases[phraseIndex]?.text === text) return
        const nextPhrases = phrases.map((phrase, index) => index === phraseIndex ? { ...phrase, text } : phrase)
        storeEditorState({
            ...editorState,
            phrases: phraseEditorStates.map((entry, index) => index === phraseIndex ? { ...entry, phrase: nextPhrases[index] } : entry),
        })
        actionService.updateDraft(sourcePath, {
            ...definition,
            phrases: nextPhrases,
        })
    }

    const handlePhraseTitleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        if (selectedPhraseIndex < 0) return
        const title = event.target.value
        const nextPhrases = phrases.map((phrase, index) => index === selectedPhraseIndex ? { ...phrase, title } : phrase)
        storeEditorState({
            ...editorState,
            phrases: phraseEditorStates.map((entry, index) => (
                index === selectedPhraseIndex ? { ...entry, phrase: nextPhrases[index] } : entry
            )),
        })
        actionService.updateDraft(sourcePath, {
            ...definition,
            phrases: nextPhrases,
        })
    }, [definition, editorState, phraseEditorStates, phrases, selectedPhraseIndex, sourcePath, storeEditorState])

    const handleDeletePhrase = useCallback(() => {
        if (selectedPhraseIndex < 0) return
        markdownEditorRef.current?.setMarkdown(selectedPhrase?.text ?? '')
        markdownHistoryStore.discardDocument(selectedTab)
        const nextPhrases = phrases.filter((_phrase, index) => index !== selectedPhraseIndex)
        storeEditorState({
            phrases: phraseEditorStates.filter((_entry, index) => index !== selectedPhraseIndex),
            selectedTab: PROMPT_TAB,
        })
        actionService.updateDraft(sourcePath, {
            ...definition,
            phrases: nextPhrases,
        })
    }, [
        definition,
        markdownHistoryStore,
        phraseEditorStates,
        phrases,
        selectedPhrase,
        selectedPhraseIndex,
        selectedTab,
        sourcePath,
        storeEditorState,
    ])

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
        actionService.keepDraft(sourcePath)
    }

    const handleReloadExternal = () => {
        actionService.reloadDraft(sourcePath)
    }

    const selectableActions = actions.filter(({ id }) => id !== action.id)
    const dirty = draft.revision !== draft.savedRevision
    const canRetry = !!saveError && validation.valid && dirty && !conflict && !saving
    const handleRetry = () => {
        if (!canRetry) return
        actionService.retryDraft(sourcePath)
    }
    const status = saveError
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
                                onDocumentEdit={handleMarkdownChange}
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
                    {phrases.map((phrase, index) => (
                        <Tab
                            key={phraseEditorStates[index].identity}
                            label={actionPhraseLabel(phrase.title, phrase.text)}
                            value={phraseEditorStates[index].identity}
                        />
                    ))}
                    <Tab aria-label="Add predefined phrase" label="+" value="add-phrase" />
                </Tabs>
            ) : null}
        </Box>
    )
}
