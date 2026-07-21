import { Tab, Tabs } from '@mui/material'
import { useCallback, useEffect } from 'react'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import { actionService } from '../../services/actions/action_service'
import { actionMarkdownDataSource } from '../editor/action_markdown_data_source'
import type { ActionMarkdownPresentation } from './action_editor'
import { ActionEditorTab } from './action_editor_tab'
import { ActionPhraseToolbarControls } from './action_phrase_toolbar_controls'
import { actionPhraseLabel } from './action_phrase_label'
import { ACTION_DEFINITION_TAB, useActionEditorController } from './use_action_editor_controller'
import { useRetainedAction } from './use_retained_action'

interface ActionEditorNavigationProps {
    discardMarkdownDocument: (documentId: string) => void
    markdownDocumentNamespace: string
    onMarkdownPresentationChange: (presentation: ActionMarkdownPresentation | null) => void
}

/** Tabs and Markdown binding backed directly by ActionService controller. */
export function ActionEditorNavigation(props: ActionEditorNavigationProps) {
    const { discardMarkdownDocument, markdownDocumentNamespace, onMarkdownPresentationChange } = props
    const action = useRetainedAction()
    const actions = actionService.getActions()
    const controller = useActionEditorController({ action, actions, discardMarkdownDocument, markdownDocumentNamespace })
    const {
        activeTab, definition, errors, handleDeletePhrase, handlePhraseTitleCommit, handlePhraseTitleEdit,
        handleTabChange, markdownDocumentId, phraseEditorStates, phrases, selectedPhrase, validation,
    } = controller

    const phraseToolbarContents = useCallback(() => {
        if (!selectedPhrase) throw new Error('Missing selected phrase')

        return (
            <ActionPhraseToolbarControls
                onDelete={handleDeletePhrase}
                onTitleCommit={handlePhraseTitleCommit}
                onTitleEdit={handlePhraseTitleEdit}
                title={selectedPhrase.title}
            />
        )
    }, [handleDeletePhrase, handlePhraseTitleCommit, handlePhraseTitleEdit, selectedPhrase])

    useEffect(() => {
        const documentId = definition.type === 'agent' && activeTab !== ACTION_DEFINITION_TAB ? markdownDocumentId : null
        actionMarkdownDataSource.setActiveActionDocument(markdownDocumentNamespace, documentId)
        onMarkdownPresentationChange(documentId ? {
            placeholders: selectedPhrase ? undefined : ACTION_PROMPT_PLACEHOLDERS,
            toolbarContents: selectedPhrase ? phraseToolbarContents : undefined,
        } : null)
    }, [activeTab, definition.type, markdownDocumentId, markdownDocumentNamespace,
        onMarkdownPresentationChange, phraseToolbarContents, selectedPhrase])

    useEffect(() => () => {
        actionMarkdownDataSource.setActiveActionDocument(markdownDocumentNamespace, null)
        onMarkdownPresentationChange(null)
    }, [markdownDocumentNamespace, onMarkdownPresentationChange])

    if (definition.type !== 'agent') return null
    const definitionError = validation.error && validation.field !== 'prompt' && validation.field !== 'phrases'
        ? validation.error
        : undefined
    const phraseErrorIndex = validation.field === 'phrases' ? validation.index : null

    return (
        <Tabs aria-label="Action editor sections" onChange={handleTabChange} scrollButtons="auto" sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0, order: 2 }} value={activeTab} variant="scrollable">
            <ActionEditorTab error={definitionError} label="Definition" value={ACTION_DEFINITION_TAB} />
            <ActionEditorTab error={errors.prompt} label="Prompt" value="prompt" />
            {phrases.map((phrase, index) => (
                <ActionEditorTab
                    error={phraseErrorIndex === index ? errors.phrases : undefined}
                    key={phraseEditorStates[index].identity}
                    label={actionPhraseLabel(phrase.title, phrase.text)}
                    value={phraseEditorStates[index].identity}
                />
            ))}
            <Tab aria-label="Add predefined phrase" label="+" value="add-phrase" />
        </Tabs>
    )
}
