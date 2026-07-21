import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import type { ActionDefinition } from '../../data/action_types'
import { actionService } from '../../services/actions/action_service'
import { openFilesService } from '../../services/open_files_service'
import { actionMarkdownDocumentId } from '../editor/action_markdown_data_source'
import {
    ACTION_DEFINITION_TAB,
    ACTION_PROMPT_TAB,
    reconcileActionPhraseEditorState,
} from './action_phrase_editor_state'

export interface ActionEditorControllerOptions {
    action: ActionDefinition
    actions: ActionDefinition[]
    discardMarkdownDocument: (documentId: string) => void
    markdownDocumentNamespace: string
}

/** Bridge ActionService-owned draft state into ActionEditor presentation. */
export function useActionEditorController(options: ActionEditorControllerOptions) {
    const { action, actions, discardMarkdownDocument, markdownDocumentNamespace } = options
    const sourcePath = action.sourcePath
    if (!sourcePath) throw new Error(`Action editor requires a persisted action: ${action.id}`)

    const [, setEditorRevision] = useState(0)
    useEffect(() => {
        let previousAction = actionService.getActionByPath(sourcePath)
        let previousDraft = actionService.getDraft(sourcePath)
        let previousEditorState = previousAction?.editorState
        const handleChanged = () => {
            const nextAction = actionService.getActionByPath(sourcePath)
            const nextDraft = actionService.getDraft(sourcePath)
            const nextEditorState = nextAction?.editorState
            if (nextAction === previousAction && nextDraft === previousDraft && nextEditorState === previousEditorState) return

            previousAction = nextAction
            previousDraft = nextDraft
            previousEditorState = nextEditorState
            setEditorRevision((current) => current + 1)
        }
        actionService.addEventListener('changed', handleChanged)

        return () => actionService.removeEventListener('changed', handleChanged)
    }, [sourcePath])

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
    const storeEditorState = useCallback((nextEditorState: typeof editorState) => {
        actionService.setActionEditorState(sourcePath, nextEditorState)
    }, [sourcePath])

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
        discardMarkdownDocument(markdownDocumentId)
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
        selectedPhraseIndex,
        sourcePath,
        storeEditorState,
    ])

    const handleDiscardDeleted = () => {
        actionService.discardDeletedDraft(sourcePath)
        const document = openFilesService.getSnapshot().documents.find((candidate) => (
            candidate.kind === 'action' && candidate.getObject().id === action.id
        ))
        if (document) openFilesService.closeDocument(document)
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
        handleDeletePhrase,
        handleDiscardDeleted,
        handleKeepMine: () => actionService.keepDraft(sourcePath),
        handlePhraseTitleCommit,
        handlePhraseTitleEdit,
        handleRecreateDeleted: () => actionService.recreateDeletedDraft(sourcePath),
        handleReloadExternal: () => actionService.reloadDraft(sourcePath),
        handleRetry: () => {
            if (canRetry) actionService.retryDraft(sourcePath)
        },
        handleTabChange,
        markdownDocumentId,
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
