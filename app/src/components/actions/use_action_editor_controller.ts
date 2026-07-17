import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type SyntheticEvent } from 'react'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import { actionService } from '../../services/action_service'
import { openFilesService } from '../../services/open_files_service'
import {
    ACTION_DEFINITION_TAB,
    ACTION_PROMPT_TAB,
    reconcileActionPhraseEditorState,
} from './action_phrase_editor_state'

const ACTION_MARKDOWN_DOCUMENT_SEPARATOR = '#action-markdown:'

export interface ActionEditorControllerOptions {
    action: ActionDefinition
    actions: ActionDefinition[]
    discardMarkdownDocument: (documentId: string, markdown: string) => void
    markdownDocumentNamespace: string
}

/** Namespace one prompt or phrase history document to its owning action file. */
export function actionMarkdownDocumentId(namespace: string, sourcePath: string, editorDocumentId: string) {
    return `${namespace}${ACTION_MARKDOWN_DOCUMENT_SEPARATOR}${sourcePath}${ACTION_MARKDOWN_DOCUMENT_SEPARATOR}${editorDocumentId}`
}

/** Bridge ActionService-owned draft state into ActionEditor presentation. */
export function useActionEditorController(options: ActionEditorControllerOptions) {
    const { action, actions, discardMarkdownDocument, markdownDocumentNamespace } = options
    const sourcePath = action.sourcePath
    if (!sourcePath) throw new Error(`Action editor requires a persisted action: ${action.id}`)

    const [, setServiceRevision] = useState(0)
    useEffect(() => {
        const handleChanged = () => setServiceRevision((current) => current + 1)
        actionService.addEventListener('changed', handleChanged)

        return () => actionService.removeEventListener('changed', handleChanged)
    }, [])

    const draft = actionService.getDraft(sourcePath)
    const { conflict, definition, deleted, error: saveError, saving, validation } = draft
    const phrases = useMemo(() => definition.phrases ?? [], [definition.phrases])
    const publishedAction = actionService.getActionByPath(sourcePath) ?? action
    const editorState = reconcileActionPhraseEditorState(publishedAction.editorState, phrases)
    const { phrases: phraseEditorStates, selectedTab } = editorState

    useEffect(() => {
        if (publishedAction.editorState !== editorState) actionService.setActionEditorState(sourcePath, editorState)
    }, [editorState, publishedAction.editorState, sourcePath])

    const errors = useMemo(() => (
        validation.error && validation.field ? { [validation.field]: validation.error } : {}
    ), [validation.error, validation.field])
    const generalError = !validation.valid && !validation.field ? validation.error : null
    const selectedPhraseIndex = phraseEditorStates.findIndex(({ identity }) => identity === selectedTab)
    const selectedPhrase = selectedPhraseIndex < 0 ? null : phrases[selectedPhraseIndex]
    const activeTab = selectedTab.startsWith('phrase-') && !selectedPhrase ? ACTION_PROMPT_TAB : selectedTab
    const editorDocumentId = selectedPhrase ? selectedTab : ACTION_PROMPT_TAB
    const markdownDocumentId = actionMarkdownDocumentId(markdownDocumentNamespace, sourcePath, editorDocumentId)
    const markdownDocumentIds = useMemo(() => [
        actionMarkdownDocumentId(markdownDocumentNamespace, sourcePath, ACTION_PROMPT_TAB),
        ...phraseEditorStates.map(({ identity }) => actionMarkdownDocumentId(markdownDocumentNamespace, sourcePath, identity)),
    ], [markdownDocumentNamespace, phraseEditorStates, sourcePath])
    const markdown = selectedPhrase?.text ?? definition.prompt ?? ''

    const storeEditorState = useCallback((nextEditorState: typeof editorState) => {
        actionService.setActionEditorState(sourcePath, nextEditorState)
    }, [sourcePath])

    const handleDefinitionChange = (nextDefinition: RawActionDefinition) => {
        actionService.updateDraft(sourcePath, nextDefinition)
    }

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

    const handleMarkdownChange = useCallback((text: string) => {
        if (editorDocumentId === ACTION_PROMPT_TAB) {
            if (definition.prompt !== text) actionService.updateDraft(sourcePath, { ...definition, prompt: text })
            return
        }
        const phraseIndex = phraseEditorStates.findIndex(({ identity }) => identity === editorDocumentId)
        if (phraseIndex < 0) throw new Error(`Unknown action Markdown document: ${editorDocumentId}`)
        if (phrases[phraseIndex]?.text === text) return
        const nextPhrases = phrases.map((phrase, index) => index === phraseIndex ? { ...phrase, text } : phrase)
        storeEditorState({
            ...editorState,
            phrases: phraseEditorStates.map((entry, index) => index === phraseIndex ? { ...entry, phrase: nextPhrases[index] } : entry),
        })
        actionService.updateDraft(sourcePath, { ...definition, phrases: nextPhrases })
    }, [definition, editorDocumentId, editorState, phraseEditorStates, phrases, sourcePath, storeEditorState])

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
        actionService.updateDraft(sourcePath, { ...definition, phrases: nextPhrases })
    }, [definition, editorState, phraseEditorStates, phrases, selectedPhraseIndex, sourcePath, storeEditorState])

    const handleDeletePhrase = useCallback(() => {
        if (selectedPhraseIndex < 0) return
        discardMarkdownDocument(markdownDocumentId, selectedPhrase?.text ?? '')
        const nextPhrases = phrases.filter((_phrase, index) => index !== selectedPhraseIndex)
        storeEditorState({
            phrases: phraseEditorStates.filter((_entry, index) => index !== selectedPhraseIndex),
            selectedTab: ACTION_PROMPT_TAB,
        })
        actionService.updateDraft(sourcePath, { ...definition, phrases: nextPhrases })
    }, [
        definition,
        discardMarkdownDocument,
        markdownDocumentId,
        phraseEditorStates,
        phrases,
        selectedPhrase,
        selectedPhraseIndex,
        sourcePath,
        storeEditorState,
    ])

    const handleDiscardDeleted = () => {
        actionService.discardDeletedDraft(sourcePath)
        openFilesService.closeFile(sourcePath)
    }
    const dirty = draft.revision !== draft.savedRevision
    const canRetry = !!saveError && validation.valid && dirty && !conflict && !saving

    return {
        activeTab,
        canRetry,
        conflict,
        definition,
        deleted,
        draft,
        editorDocumentId,
        editorState,
        errors,
        generalError,
        handleDefinitionChange,
        handleDeletePhrase,
        handleDiscardDeleted,
        handleKeepMine: () => actionService.keepDraft(sourcePath),
        handleMarkdownChange,
        handlePhraseTitleChange,
        handleRecreateDeleted: () => actionService.recreateDeletedDraft(sourcePath),
        handleReloadExternal: () => actionService.reloadDraft(sourcePath),
        handleRetry: () => {
            if (canRetry) actionService.retryDraft(sourcePath)
        },
        handleTabChange,
        markdown,
        markdownDocumentId,
        markdownDocumentIds,
        phraseEditorStates,
        phrases,
        saveError,
        saving,
        selectableActions: actions.filter(({ id }) => id !== action.id),
        selectedPhrase,
        sourcePath,
        status: saveError ? 'Save failed. Retry to save changes.' : validation.valid ? null : 'Fix validation errors to save.',
        validation,
    }
}

export { ACTION_DEFINITION_TAB, ACTION_PROMPT_TAB }
