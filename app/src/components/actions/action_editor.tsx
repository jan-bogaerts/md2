import { Alert, Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useCallback, useEffect, type ReactNode } from 'react'
import type { ActionDefinition } from '../../data/action_types'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import { dialogService } from '../../services/dialog_service'
import { actionMarkdownDataSource } from '../editor/action_markdown_data_source'
import { useWorktrees } from '../hooks/use_worktrees'
import { ActionDefinitionFields } from './action_definition_fields'
import { ActionEditorTab } from './action_editor_tab'
import { ActionPhraseToolbarControls } from './action_phrase_toolbar_controls'
import { actionPhraseLabel } from './action_phrase_label'
import {
    ACTION_DEFINITION_TAB,
    useActionEditorController,
} from './use_action_editor_controller'

interface ActionEditorProps {
    action: ActionDefinition
    actions: ActionDefinition[]
    cardTypes: string[]
    discardMarkdownDocument: (documentId: string) => void
    markdownDocumentNamespace: string
    onMarkdownPresentationChange: (presentation: ActionMarkdownPresentation | null) => void
    repositoryFiles: string[]
    specialContextTypes: string[]
    states: string[]
}

export interface ActionMarkdownPresentation {
    placeholders?: typeof ACTION_PROMPT_PLACEHOLDERS
    toolbarContents?: () => ReactNode
}

export function ActionEditor(props: ActionEditorProps) {
    const {
        action,
        actions,
        cardTypes,
        discardMarkdownDocument,
        markdownDocumentNamespace,
        onMarkdownPresentationChange,
        repositoryFiles,
        specialContextTypes,
        states,
    } = props
    const worktrees = useWorktrees()
    const controller = useActionEditorController({ action, actions, discardMarkdownDocument, markdownDocumentNamespace })
    const {
        activeTab,
        canRetry,
        conflict,
        definition,
        deleted,
        errors,
        handleDefinitionChange,
        handleDefinitionCommit,
        handleDeletePhrase,
        handleDiscardDeleted,
        handleKeepMine,
        handlePhraseTitleCommit,
        handlePhraseTitleEdit,
        handleRecreateDeleted,
        handleReloadExternal,
        handleRetry,
        handleTabChange,
        markdownDocumentId,
        phraseEditorStates,
        phrases,
        saveError,
        saving,
        selectableActions,
        selectedPhrase,
        status,
        validation,
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
        const documentId = definition.type === 'agent' && activeTab !== ACTION_DEFINITION_TAB
            ? markdownDocumentId
            : null
        actionMarkdownDataSource.setActiveDocument('list-action', documentId)
        onMarkdownPresentationChange(documentId ? {
            placeholders: selectedPhrase ? undefined : ACTION_PROMPT_PLACEHOLDERS,
            toolbarContents: selectedPhrase ? phraseToolbarContents : undefined,
        } : null)

    }, [activeTab, definition.type, markdownDocumentId, onMarkdownPresentationChange, phraseToolbarContents, selectedPhrase])

    useEffect(() => () => {
        actionMarkdownDataSource.setActiveDocument('list-action', null)
        onMarkdownPresentationChange(null)
    }, [onMarkdownPresentationChange])

    const definitionError = validation.error && validation.field !== 'prompt' && validation.field !== 'phrases'
        ? validation.error
        : undefined
    const promptError = errors.prompt
    const phraseErrorIndex = validation.field === 'phrases' ? validation.index : null
    const showActionContent = definition.type !== 'agent'
        || activeTab === ACTION_DEFINITION_TAB
        || !!saveError
        || deleted
        || !!conflict

    useEffect(() => {
        if (validation.error) dialogService.error(validation.error, { title: 'Invalid action' })
    }, [validation.error])

    return (
        <Box data-testid="action-editor" sx={{ display: 'contents' }}>
            <Box
                data-testid="action-editor-content"
                hidden={!showActionContent}
                sx={{ flex: activeTab === ACTION_DEFINITION_TAB || definition.type !== 'agent' ? 1 : '0 0 auto', minHeight: 0, order: 1, overflowY: 'auto', p: 2 }}
            >
                {saveError ? (
                    <Alert
                        action={<Button color="inherit" disabled={!canRetry} onClick={handleRetry} size="small">Retry save</Button>}
                        severity="error"
                        sx={{ mb: 2 }}
                    >
                        {saveError}
                    </Alert>
                ) : null}
                {deleted ? (
                    <Alert
                        action={(
                            <Stack direction="row" spacing={1}>
                                <Button
                                    color="inherit"
                                    disabled={!validation.valid || saving}
                                    onClick={handleRecreateDeleted}
                                    size="small"
                                >
                                    Recreate file
                                </Button>
                                <Button color="inherit" onClick={handleDiscardDeleted} size="small">Discard draft</Button>
                            </Stack>
                        )}
                        severity="warning"
                        sx={{ mb: 2 }}
                    >
                        This action file was deleted outside the editor. Recreate it or discard this draft.
                    </Alert>
                ) : null}
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
                        {activeTab === ACTION_DEFINITION_TAB ? (
                            <ActionDefinitionFields
                                actions={selectableActions}
                                cardTypes={cardTypes}
                                definition={definition}
                                errorIndex={validation.index}
                                errors={errors}
                                onChange={handleDefinitionChange}
                                onCommit={handleDefinitionCommit}
                                repositoryFiles={repositoryFiles}
                                specialContextTypes={specialContextTypes}
                                states={states}
                                worktrees={worktrees}
                            />
                        ) : null}
                    </>
                ) : (
                    <ActionDefinitionFields
                        actions={selectableActions}
                        cardTypes={cardTypes}
                        definition={definition}
                        errorIndex={validation.index}
                        errors={errors}
                        onChange={handleDefinitionChange}
                        onCommit={handleDefinitionCommit}
                        repositoryFiles={repositoryFiles}
                        specialContextTypes={specialContextTypes}
                        states={states}
                        worktrees={worktrees}
                    />
                )}
                {status && (definition.type !== 'agent' || activeTab === ACTION_DEFINITION_TAB) ? (
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
                    sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0, order: 2 }}
                    value={activeTab}
                    variant="scrollable"
                >
                    <ActionEditorTab error={definitionError} label="Definition" value={ACTION_DEFINITION_TAB} />
                    <ActionEditorTab error={promptError} label="Prompt" value="prompt" />
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
            ) : null}
        </Box>
    )
}
