import { Tab, Tabs } from '@mui/material'
import { useCallback, useEffect } from 'react'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import type { ActionDefinition } from '../../data/action_types'
import { actionService } from '../../services/actions/action_service'
import type { ActionOpenDocument } from '../../services/open_files_service'
import { actionMarkdownDataSource } from '../editor/action_markdown_data_source'
import type { MarkdownDocumentTarget } from '../editor/markdown_data_source'
import type { ActionMarkdownPresentation } from './action_editor'
import { ActionEditorTab } from './action_editor_tab'
import { ActionPhraseToolbarControls } from './action_phrase_toolbar_controls'
import { actionPhraseLabel } from './action_phrase_label'
import { ACTION_DEFINITION_TAB, useActionEditorController } from './use_action_editor_controller'

interface ActionEditorNavigationProps {
    action: ActionDefinition
    discardMarkdownTarget: (target: MarkdownDocumentTarget) => void
    openDocument: ActionOpenDocument
    onMarkdownPresentationChange: (presentation: ActionMarkdownPresentation | null) => void
    sourcePath: string
}

/** Tabs and Markdown binding backed directly by ActionService controller. */
export function ActionEditorNavigation(props: ActionEditorNavigationProps) {
    const { action, discardMarkdownTarget, openDocument, onMarkdownPresentationChange, sourcePath } = props
    const actions = actionService.getActions()
    const controller = useActionEditorController({ action, actions, discardMarkdownTarget, openDocument, sourcePath })
    const {
        activeTab, definition, errors, handleDeletePhrase, handlePhraseTitleCommit, handlePhraseTitleEdit,
        handleTabChange, markdownTarget, phraseEditorStates, phrases, selectedPhrase, validation,
    } = controller

    const phraseToolbarContents = useCallback(() => {
        if (!selectedPhrase) return null

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
        const target = definition.type === 'agent' && activeTab !== ACTION_DEFINITION_TAB ? markdownTarget : null
        actionMarkdownDataSource.setActiveActionTarget(target)
        onMarkdownPresentationChange(target ? {
            placeholders: selectedPhrase ? undefined : ACTION_PROMPT_PLACEHOLDERS,
            toolbarContents: selectedPhrase ? phraseToolbarContents : undefined,
        } : null)
    }, [activeTab, definition.type, markdownTarget,
        onMarkdownPresentationChange, phraseToolbarContents, selectedPhrase])

    useEffect(() => () => {
        actionMarkdownDataSource.setActiveActionTarget(null)
        onMarkdownPresentationChange(null)
    }, [onMarkdownPresentationChange])

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
