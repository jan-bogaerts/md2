import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import { actionService } from '../../services/actions/action_service'
import { openFilesService } from '../../services/open_files_service'
import {
    ACTION_DEFINITION_TAB,
    ACTION_PROMPT_TAB,
    reconcileActionPhraseEditorState,
} from './action_phrase_editor_state'

export interface ActionEditorControllerOptions {
    action: ActionDefinition
    actions: ActionDefinition[]
    discardMarkdownDocument: (documentId: string, markdown: string) => void
    markdownDocumentNamespace: string
}

/** Namespace one prompt or phrase history document to its stable owning action. */
export function actionMarkdownDocumentId(namespace: string, actionId: string, editorDocumentId: string) {
    return JSON.stringify([namespace, actionId, editorDocumentId])
}

/** Bridge ActionService-owned draft state into ActionEditor presentation. */
export function useActionEditorController(options: ActionEditorControllerOptions) {
    const { action, actions, discardMarkdownDocument, markdownDocumentNamespace } = options
    const sourcePath = action.sourcePath
    if (!sourcePath) throw new Error(`Action editor requires a persisted action: ${action.id}`)

    const [, setEditorRevision] = useState(0)
    useEffect(() => {
        const handleChanged = () => setEditorRevision((current) => current + 1)
        actionService.addEventListener('changed', handleChanged)

        return () => actionService.removeEventListener('changed', handleChanged)
    }, [])

    const draft = actionService.getDraft(sourcePath)
    const { conflict, definition, deleted, error: saveError, saving, validation } = draft
    useEffect(() => () => {
        const actionExists = !!actionService.getActionByPath(sourcePath)
        const deletedDraftExists = actionService.getDeletedDraftActions()
            .some((candidate) => candidate.sourcePath === sourcePath)
        if (actionExists || deletedDraftExists) actionService.commitDraft(sourcePath)
    }, [sourcePath])
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
    const selectedPhraseIndex = phraseEditorStates.findIndex(({ identity }) => identity === selectedTab)
    const selectedPhrase = selectedPhraseIndex < 0 ? null : phrases[selectedPhraseIndex]
    const activeTab = selectedTab.startsWith('phrase-') && !selectedPhrase ? ACTION_PROMPT_TAB : selectedTab
    const editorDocumentId = selectedPhrase ? selectedTab : ACTION_PROMPT_TAB
    const markdownDocumentId = actionMarkdownDocumentId(markdownDocumentNamespace, action.id, editorDocumentId)
    const markdownDocumentIds = useMemo(() => [
        actionMarkdownDocumentId(markdownDocumentNamespace, action.id, ACTION_PROMPT_TAB),
        ...phraseEditorStates.map(({ identity }) => actionMarkdownDocumentId(markdownDocumentNamespace, action.id, identity)),
    ], [action.id, markdownDocumentNamespace, phraseEditorStates])
    const markdown = selectedPhrase?.text ?? definition.prompt ?? ''

    const storeEditorState = useCallback((nextEditorState: typeof editorState) => {
        actionService.setActionEditorState(sourcePath, nextEditorState)
    }, [sourcePath])

    const handleDefinitionChange = (nextDefinition: RawActionDefinition) => {
        actionService.stageDraft(sourcePath, nextDefinition)
        setEditorRevision((current) => current + 1)
    }

    const handleDefinitionCommit = () => actionService.commitDraft(sourcePath)

    const handleAddPhrase = () => {
        const currentDefinition = actionService.getDraft(sourcePath).definition
        const currentPhrases = currentDefinition.phrases ?? []
        const syncedEditorState = {
            phrases: phraseEditorStates.map((entry, index) => ({ ...entry, phrase: currentPhrases[index] })),
            selectedTab,
        }
        const nextPhrases = [...currentPhrases, { text: '', title: '' }]
        const nextEditorState = reconcileActionPhraseEditorState(syncedEditorState, nextPhrases)
        const nextTab = nextEditorState.phrases[nextEditorState.phrases.length - 1].identity
        const nextDefinition = { ...currentDefinition, phrases: nextPhrases }
        actionService.updateDraft(sourcePath, nextDefinition)
        storeEditorState({ ...nextEditorState, selectedTab: nextTab })
    }

    const handleTabChange = (_event: SyntheticEvent, value: string) => {
        if (value === 'add-phrase') {
            handleAddPhrase()
            return
        }
        if (activeTab === ACTION_DEFINITION_TAB) actionService.commitDraft(sourcePath)
        const currentPhrases = actionService.getDraft(sourcePath).definition.phrases ?? []
        const syncedPhraseEditorStates = phraseEditorStates.map((entry, index) => ({
            ...entry,
            phrase: currentPhrases[index],
        }))
        storeEditorState({ phrases: syncedPhraseEditorStates, selectedTab: value })
    }

    const handleMarkdownEdit = useCallback((text: string) => {
        const currentDefinition = actionService.getDraft(sourcePath).definition
        if (editorDocumentId === ACTION_PROMPT_TAB) {
            actionService.stageDraft(sourcePath, { ...currentDefinition, prompt: text })
            return
        }
        const phraseIndex = phraseEditorStates.findIndex(({ identity }) => identity === editorDocumentId)
        if (phraseIndex < 0) throw new Error(`Unknown action Markdown document: ${editorDocumentId}`)
        const currentPhrases = currentDefinition.phrases ?? []
        const nextPhrases = currentPhrases.map((phrase, index) => index === phraseIndex ? { ...phrase, text } : phrase)
        actionService.stageDraft(sourcePath, { ...currentDefinition, phrases: nextPhrases })
    }, [editorDocumentId, phraseEditorStates, sourcePath])

    const handleMarkdownChange = useCallback((text: string) => {
        handleMarkdownEdit(text)
        const currentDefinition = actionService.getDraft(sourcePath).definition
        if (editorDocumentId !== ACTION_PROMPT_TAB) {
            const phraseIndex = phraseEditorStates.findIndex(({ identity }) => identity === editorDocumentId)
            const currentPhrases = currentDefinition.phrases ?? []
            if (phraseIndex < 0 || !currentPhrases[phraseIndex]) {
                throw new Error(`Unknown action Markdown document: ${editorDocumentId}`)
            }
            storeEditorState({
                ...editorState,
                phrases: phraseEditorStates.map((entry, index) => (
                    index === phraseIndex ? { ...entry, phrase: currentPhrases[index] } : entry
                )),
            })
        }
        actionService.commitDraft(sourcePath)
    }, [editorDocumentId, editorState, handleMarkdownEdit, phraseEditorStates, sourcePath, storeEditorState])

    const handlePhraseTitleEdit = useCallback((title: string) => {
        if (selectedPhraseIndex < 0) return
        const currentDefinition = actionService.getDraft(sourcePath).definition
        const currentPhrases = currentDefinition.phrases ?? []
        const nextPhrases = currentPhrases.map((phrase, index) => index === selectedPhraseIndex ? { ...phrase, title } : phrase)
        actionService.stageDraft(sourcePath, { ...currentDefinition, phrases: nextPhrases })
    }, [selectedPhraseIndex, sourcePath])

    const handlePhraseTitleCommit = useCallback((title: string) => {
        handlePhraseTitleEdit(title)
        const currentDefinition = actionService.getDraft(sourcePath).definition
        const currentPhrases = currentDefinition.phrases ?? []
        storeEditorState({
            ...editorState,
            phrases: phraseEditorStates.map((entry, index) => (
                index === selectedPhraseIndex ? { ...entry, phrase: currentPhrases[index] } : entry
            )),
        })
        actionService.commitDraft(sourcePath)
    }, [editorState, handlePhraseTitleEdit, phraseEditorStates, selectedPhraseIndex, sourcePath, storeEditorState])

    const handleDeletePhrase = useCallback(() => {
        if (selectedPhraseIndex < 0) return
        discardMarkdownDocument(markdownDocumentId, selectedPhrase?.text ?? '')
        const currentDefinition = actionService.getDraft(sourcePath).definition
        const currentPhrases = currentDefinition.phrases ?? []
        const nextPhrases = currentPhrases.filter((_phrase, index) => index !== selectedPhraseIndex)
        const nextDefinition = { ...currentDefinition, phrases: nextPhrases }
        actionService.updateDraft(sourcePath, nextDefinition)
        storeEditorState({
            phrases: phraseEditorStates.filter((_entry, index) => index !== selectedPhraseIndex),
            selectedTab: ACTION_PROMPT_TAB,
        })
    }, [
        discardMarkdownDocument,
        markdownDocumentId,
        phraseEditorStates,
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
        handleDefinitionChange,
        handleDefinitionCommit,
        handleDeletePhrase,
        handleDiscardDeleted,
        handleKeepMine: () => actionService.keepDraft(sourcePath),
        handleMarkdownChange,
        handleMarkdownEdit,
        handlePhraseTitleCommit,
        handlePhraseTitleEdit,
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
