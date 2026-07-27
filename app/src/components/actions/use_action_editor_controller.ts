import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react'
import type { ActionDefinition } from '../../data/action_types'
import {
    ACTION_DRAFT_CHANGED_EVENT,
    actionService,
    type ActionDraftChangedDetail,
} from '../../services/actions/action_service'
import { openFilesService } from '../../services/open_files_service'
import type { ActionOpenDocument } from '../../services/open_files_service'
import type { MarkdownDocumentTarget } from '../editor/markdown_data_source'
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

    const [, setEditorRevision] = useState(0)
    useEffect(() => {
        let previousAction = actionService.getActionByPath(sourcePath)
        let previousDraft = actionService.draftStore.getDraft(sourcePath)
        let previousEditorState = previousAction?.editorState
        const handleChanged = (event: Event) => {
            const { path } = (event as CustomEvent<ActionDraftChangedDetail>).detail
            if (path !== sourcePath) return

            const nextAction = actionService.getActionByPath(sourcePath)
            const nextDraft = actionService.draftStore.getDraft(sourcePath)
            const nextEditorState = nextAction?.editorState
            if (nextAction === previousAction && nextDraft === previousDraft && nextEditorState === previousEditorState) return

            previousAction = nextAction
            previousDraft = nextDraft
            previousEditorState = nextEditorState
            setEditorRevision((current) => current + 1)
        }
        actionService.addEventListener(ACTION_DRAFT_CHANGED_EVENT, handleChanged)

        return () => actionService.removeEventListener(ACTION_DRAFT_CHANGED_EVENT, handleChanged)
    }, [sourcePath])

    const draft = actionService.draftStore.getDraft(sourcePath)
    const { conflict, definition, deleted, error: saveError, saving, validation } = draft
    useEffect(() => () => {
        const actionExists = !!actionService.getActionByPath(sourcePath)
        const deletedDraftExists = actionService.draftStore.getDeletedDraftActions()
            .some((candidate) => candidate.sourcePath === sourcePath)
        if (actionExists || deletedDraftExists) actionService.draftStore.commitDraft(sourcePath)
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
        actionService.setActionEditorState(sourcePath, nextEditorState)
    }, [sourcePath])

    const handleAddPhrase = () => {
        const currentDefinition = actionService.draftStore.getDraft(sourcePath).definition
        const currentPhrases = currentDefinition.phrases ?? []
        const syncedEditorState = {
            phrases: phraseEditorStates.map((entry, index) => ({ ...entry, phrase: currentPhrases[index] })),
            selectedTab,
        }
        const nextPhrases = [...currentPhrases, { text: '', title: '' }]
        const nextEditorState = reconcileActionPhraseEditorState(syncedEditorState, nextPhrases)
        const nextTab = nextEditorState.phrases[nextEditorState.phrases.length - 1].identity
        const nextDefinition = { ...currentDefinition, phrases: nextPhrases }
        actionService.draftStore.updateDraft(sourcePath, nextDefinition)
        storeEditorState({ ...nextEditorState, selectedTab: nextTab })
    }

    const handleTabChange = (_event: SyntheticEvent, value: string) => {
        if (value === 'add-phrase') {
            handleAddPhrase()
            return
        }
        if (activeTab === ACTION_DEFINITION_TAB) actionService.draftStore.commitDraft(sourcePath)
        const currentPhrases = actionService.draftStore.getDraft(sourcePath).definition.phrases ?? []
        const syncedPhraseEditorStates = phraseEditorStates.map((entry, index) => ({
            ...entry,
            phrase: currentPhrases[index],
        }))
        storeEditorState({ phrases: syncedPhraseEditorStates, selectedTab: value })
    }

    const handlePhraseTitleEdit = useCallback((title: string) => {
        if (selectedPhraseIndex < 0) return
        const currentDefinition = actionService.draftStore.getDraft(sourcePath).definition
        const currentPhrases = currentDefinition.phrases ?? []
        const nextPhrases = currentPhrases.map((phrase, index) => index === selectedPhraseIndex ? { ...phrase, title } : phrase)
        actionService.draftStore.stageDraft(sourcePath, { ...currentDefinition, phrases: nextPhrases })
    }, [selectedPhraseIndex, sourcePath])

    const handlePhraseTitleCommit = useCallback((title: string) => {
        handlePhraseTitleEdit(title)
        const currentDefinition = actionService.draftStore.getDraft(sourcePath).definition
        const currentPhrases = currentDefinition.phrases ?? []
        storeEditorState({
            ...editorState,
            phrases: phraseEditorStates.map((entry, index) => (
                index === selectedPhraseIndex ? { ...entry, phrase: currentPhrases[index] } : entry
            )),
        })
        actionService.draftStore.commitDraft(sourcePath)
    }, [editorState, handlePhraseTitleEdit, phraseEditorStates, selectedPhraseIndex, sourcePath, storeEditorState])

    const handleDeletePhrase = useCallback(() => {
        if (selectedPhraseIndex < 0) return
        discardMarkdownTarget(markdownTarget)
        const currentDefinition = actionService.draftStore.getDraft(sourcePath).definition
        const currentPhrases = currentDefinition.phrases ?? []
        const nextPhrases = currentPhrases.filter((_phrase, index) => index !== selectedPhraseIndex)
        const nextDefinition = { ...currentDefinition, phrases: nextPhrases }
        actionService.draftStore.updateDraft(sourcePath, nextDefinition)
        storeEditorState({
            phrases: phraseEditorStates.filter((_entry, index) => index !== selectedPhraseIndex),
            selectedTab: ACTION_PROMPT_TAB,
        })
    }, [
        discardMarkdownTarget,
        markdownTarget,
        phraseEditorStates,
        selectedPhraseIndex,
        sourcePath,
        storeEditorState,
    ])

    const handleDiscardDeleted = () => {
        actionService.draftStore.discardDeletedDraft(sourcePath)
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
        handleKeepMine: () => actionService.draftStore.keepDraft(sourcePath),
        handlePhraseTitleCommit,
        handlePhraseTitleEdit,
        handleRecreateDeleted: () => actionService.draftStore.recreateDeletedDraft(sourcePath),
        handleReloadExternal: () => actionService.draftStore.reloadDraft(sourcePath),
        handleRetry: () => {
            if (canRetry) actionService.draftStore.retryDraft(sourcePath)
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
