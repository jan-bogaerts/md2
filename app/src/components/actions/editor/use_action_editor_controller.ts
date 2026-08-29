import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import type { ActionDefinition } from '../../../data/action_types'
import {
    ACTION_DRAFT_CHANGED_EVENT,
    actionService,
    type ActionDraftChangedDetail,
} from '../../../services/actions/action_service'
import { openFilesService } from '../../../services/open_files_service'
import type { ActionOpenDocument } from '../../../services/open_files_service'
import type { MarkdownDocumentTarget } from '../../editor/markdown_data_source'
import {
    ACTION_DEFINITION_TAB,
    ACTION_PROMPT_TAB,
    reconcileActionPhraseEditorState,
} from './action_phrase_editor_state'

export interface ActionEditorControllerOptions {
    action: ActionDefinition
    actions: ActionDefinition[]
    discardMarkdownTarget: (target: MarkdownDocumentTarget) => void
    openDocument: ActionOpenDocument
    sourcePath: string
}

/** Bridge ActionService-owned draft state into ActionEditor presentation. */
export function useActionEditorController(options: ActionEditorControllerOptions) {
    const { action, actions, discardMarkdownTarget, openDocument, sourcePath } = options
    const actionId = action.id

    const [, setEditorRevision] = useState(0)
    useEffect(() => {
        let previousAction = actionService.getActionById(actionId)
        let previousDraft = actionService.draftStore.getDraft(actionId)
        let previousEditorState = previousAction?.editorState
        const handleChanged = (event: Event) => {
            const { actionId: changedActionId } = (event as CustomEvent<ActionDraftChangedDetail>).detail
            if (changedActionId !== actionId) return

            const nextAction = actionService.getActionById(actionId)
            const nextDraft = actionService.draftStore.getDraft(actionId)
            const nextEditorState = nextAction?.editorState
            if (nextAction === previousAction && nextDraft === previousDraft && nextEditorState === previousEditorState) return

            previousAction = nextAction
            previousDraft = nextDraft
            previousEditorState = nextEditorState
            setEditorRevision((current) => current + 1)
        }
        actionService.addEventListener(ACTION_DRAFT_CHANGED_EVENT, handleChanged)

        return () => actionService.removeEventListener(ACTION_DRAFT_CHANGED_EVENT, handleChanged)
    }, [actionId])

    const draft = actionService.draftStore.getDraft(actionId)
    const { conflict, definition, deleted, error: saveError, saving, validation } = draft
    useEffect(() => () => {
        const actionExists = !!actionService.getActionById(actionId)
        const deletedDraftExists = actionService.draftStore.getDeletedDraftActions()
            .some((candidate) => candidate.id === actionId)
        if (actionExists || deletedDraftExists) actionService.draftStore.commitDraft(actionId)
    }, [actionId])
    const phrases = useMemo(() => definition.phrases ?? [], [definition.phrases])
    const publishedAction = actionService.getActionById(actionId) ?? action
    const editorState = reconcileActionPhraseEditorState(publishedAction.editorState, phrases)
    const { phrases: phraseEditorStates, selectedTab } = editorState

    useEffect(() => {
        if (publishedAction.editorState !== editorState) actionService.setActionEditorState(actionId, editorState)
    }, [actionId, editorState, publishedAction.editorState])

    const errors = useMemo(() => (
        validation.error && validation.field ? { [validation.field]: validation.error } : {}
    ), [validation.error, validation.field])
    const selectedPhraseIndex = phraseEditorStates.findIndex(({ identity }) => identity === selectedTab)
    const selectedPhrase = selectedPhraseIndex < 0 ? null : phrases[selectedPhraseIndex]
    const activeTab = selectedTab.startsWith('phrase-') && !selectedPhrase ? ACTION_PROMPT_TAB : selectedTab
    const sectionIdentity = selectedPhrase ? selectedTab : ACTION_PROMPT_TAB
    const markdownTarget = useMemo<MarkdownDocumentTarget>(
        () => ({
            document: openDocument,
            section: selectedPhrase
                ? { kind: 'phrase', identity: sectionIdentity }
                : { kind: 'prompt' },
        }),
        [openDocument, sectionIdentity, selectedPhrase],
    )
    const storeEditorState = useCallback((nextEditorState: typeof editorState) => {
        actionService.setActionEditorState(actionId, nextEditorState)
    }, [actionId])

    const handleAddPhrase = () => {
        const currentDefinition = actionService.draftStore.getDraft(actionId).definition
        const currentPhrases = currentDefinition.phrases ?? []
        const syncedEditorState = {
            phrases: phraseEditorStates.map((entry, index) => ({ ...entry, phrase: currentPhrases[index] })),
            selectedTab,
        }
        const nextPhrases = [...currentPhrases, { text: '', title: '' }]
        const nextEditorState = reconcileActionPhraseEditorState(syncedEditorState, nextPhrases)
        const nextTab = nextEditorState.phrases[nextEditorState.phrases.length - 1].identity
        const nextDefinition = { ...currentDefinition, phrases: nextPhrases }
        actionService.draftStore.updateDraft(actionId, nextDefinition)
        storeEditorState({ ...nextEditorState, selectedTab: nextTab })
    }

    const handleTabChange = (_event: SyntheticEvent, value: string) => {
        if (value === 'add-phrase') {
            handleAddPhrase()
            return
        }
        if (activeTab === ACTION_DEFINITION_TAB) actionService.draftStore.commitDraft(actionId)
        const currentPhrases = actionService.draftStore.getDraft(actionId).definition.phrases ?? []
        const syncedPhraseEditorStates = phraseEditorStates.map((entry, index) => ({
            ...entry,
            phrase: currentPhrases[index],
        }))
        storeEditorState({ phrases: syncedPhraseEditorStates, selectedTab: value })
    }

    const handlePhraseTitleEdit = useCallback((title: string) => {
        if (selectedPhraseIndex < 0) return
        const currentDefinition = actionService.draftStore.getDraft(actionId).definition
        const currentPhrases = currentDefinition.phrases ?? []
        const nextPhrases = currentPhrases.map((phrase, index) => index === selectedPhraseIndex ? { ...phrase, title } : phrase)
        actionService.draftStore.stageDraft(actionId, { ...currentDefinition, phrases: nextPhrases })
    }, [actionId, selectedPhraseIndex])

    const handlePhraseTitleCommit = useCallback((title: string) => {
        handlePhraseTitleEdit(title)
        const currentDefinition = actionService.draftStore.getDraft(actionId).definition
        const currentPhrases = currentDefinition.phrases ?? []
        storeEditorState({
            ...editorState,
            phrases: phraseEditorStates.map((entry, index) => (
                index === selectedPhraseIndex ? { ...entry, phrase: currentPhrases[index] } : entry
            )),
        })
        actionService.draftStore.commitDraft(actionId)
    }, [actionId, editorState, handlePhraseTitleEdit, phraseEditorStates, selectedPhraseIndex, storeEditorState])

    const handleDeletePhrase = useCallback(() => {
        if (selectedPhraseIndex < 0) return
        discardMarkdownTarget(markdownTarget)
        const currentDefinition = actionService.draftStore.getDraft(actionId).definition
        const currentPhrases = currentDefinition.phrases ?? []
        const nextPhrases = currentPhrases.filter((_phrase, index) => index !== selectedPhraseIndex)
        const nextDefinition = { ...currentDefinition, phrases: nextPhrases }
        actionService.draftStore.updateDraft(actionId, nextDefinition)
        storeEditorState({
            phrases: phraseEditorStates.filter((_entry, index) => index !== selectedPhraseIndex),
            selectedTab: ACTION_PROMPT_TAB,
        })
    }, [
        discardMarkdownTarget,
        markdownTarget,
        phraseEditorStates,
        selectedPhraseIndex,
        actionId,
        storeEditorState,
    ])

    const handleDiscardDeleted = () => {
        actionService.draftStore.discardDeletedDraft(actionId)
        const document = openFilesService.getSnapshot().documents.find((candidate) => (
            candidate.kind === 'action' && candidate.getObject().id === action.id
        ))
        if (document) openFilesService.closeDocument(document)
    }
    const dirty = openDocument.dirty
    const canRetry = !!saveError && validation.valid && dirty && !conflict && !saving

    return {
        activeTab,
        canRetry,
        conflict,
        definition,
        deleted,
        draft,
        editorState,
        errors,
        handleDeletePhrase,
        handleDiscardDeleted,
        handleKeepMine: () => actionService.draftStore.keepDraft(actionId),
        handlePhraseTitleCommit,
        handlePhraseTitleEdit,
        handleRecreateDeleted: () => actionService.draftStore.recreateDeletedDraft(actionId),
        handleReloadExternal: () => actionService.draftStore.reloadDraft(actionId),
        handleRetry: () => {
            if (canRetry) actionService.draftStore.retryDraft(actionId)
        },
        handleTabChange,
        markdownTarget,
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
