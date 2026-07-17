import { Alert, Box, Button, FormHelperText, Stack, Tab, Tabs, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo } from 'react'
import type { ActionDefinition } from '../../data/action_types'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../data/action_placeholders'
import type { MarkdownDocumentOwnerConfig } from '../editor/markdown_document_config'
import { useWorktrees } from '../hooks/use_worktrees'
import { ActionDefinitionFields } from './action_definition_fields'
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
    discardMarkdownDocument: (documentId: string, markdown: string) => void
    onMarkdownDocumentOwnerChange: (config: MarkdownDocumentOwnerConfig) => void
    repositoryFiles: string[]
    specialContextTypes: string[]
    states: string[]
}

export function ActionEditor(props: ActionEditorProps) {
    const {
        action,
        actions,
        cardTypes,
        discardMarkdownDocument,
        onMarkdownDocumentOwnerChange,
        repositoryFiles,
        specialContextTypes,
        states,
    } = props
    const worktrees = useWorktrees()
    const controller = useActionEditorController({ action, actions, discardMarkdownDocument })
    const {
        activeTab,
        canRetry,
        conflict,
        definition,
        deleted,
        errors,
        generalError,
        handleDefinitionChange,
        handleDeletePhrase,
        handleDiscardDeleted,
        handleKeepMine,
        handleMarkdownChange,
        handlePhraseTitleChange,
        handleRecreateDeleted,
        handleReloadExternal,
        handleRetry,
        handleTabChange,
        markdown,
        markdownDocumentId,
        markdownDocumentIds,
        phraseEditorStates,
        phrases,
        saveError,
        saving,
        selectableActions,
        selectedPhrase,
        sourcePath,
        status,
        validation,
    } = controller

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
    const activeMarkdownDocument = useMemo(() => (
        definition.type === 'agent' && activeTab !== ACTION_DEFINITION_TAB ? {
            documentId: markdownDocumentId,
            markdown,
            onChange: handleMarkdownChange,
            onEdit: handleMarkdownChange,
            ownerPath: sourcePath,
            placeholders: selectedPhrase ? undefined : ACTION_PROMPT_PLACEHOLDERS,
            toolbarContents: selectedPhrase ? phraseToolbarContents : undefined,
        } : null
    ), [
        activeTab,
        definition.type,
        handleMarkdownChange,
        markdown,
        markdownDocumentId,
        phraseToolbarContents,
        selectedPhrase,
        sourcePath,
    ])
    const markdownDocumentOwner = useMemo(() => ({
        activeDocument: activeMarkdownDocument,
        documentIds: markdownDocumentIds,
        ownerPath: sourcePath,
    }), [activeMarkdownDocument, markdownDocumentIds, sourcePath])

    useEffect(() => {
        onMarkdownDocumentOwnerChange(markdownDocumentOwner)
    }, [markdownDocumentOwner, onMarkdownDocumentOwnerChange])

    const markdownFieldError = selectedPhrase ? errors.phrases : errors.prompt
    const showMarkdownStatus = !!saveError || !!generalError || deleted || !!conflict || !!status || !!markdownFieldError
    const showActionContent = definition.type !== 'agent' || activeTab === ACTION_DEFINITION_TAB || showMarkdownStatus

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
                {generalError ? <Alert severity="error" sx={{ mb: 2 }}>{generalError}</Alert> : null}
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
                                repositoryFiles={repositoryFiles}
                                specialContextTypes={specialContextTypes}
                                states={states}
                                worktrees={worktrees}
                            />
                        ) : null}
                        <Box hidden={activeTab === ACTION_DEFINITION_TAB}>
                            {selectedPhrase && errors.phrases ? <FormHelperText error>{errors.phrases}</FormHelperText> : null}
                            {!selectedPhrase && errors.prompt ? <FormHelperText error>{errors.prompt}</FormHelperText> : null}
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
                    sx={{ borderTop: 1, borderColor: 'divider', flexShrink: 0, order: 2 }}
                    value={activeTab}
                    variant="scrollable"
                >
                    <Tab label="Definition" value={ACTION_DEFINITION_TAB} />
                    <Tab label="Prompt" value="prompt" />
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
