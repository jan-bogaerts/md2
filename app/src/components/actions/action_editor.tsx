import { Alert, Box, FormHelperText, Typography } from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActionDefinition, RawActionDefinition } from '../../data/action_types'
import {
    actionService,
    editableActionDefinition,
    serializeActionDefinition,
} from '../../services/action_service'
import { dialogService } from '../../services/dialog_service'
import { MarkdownEditor } from '../editor/markdown_editor'
import { ActionDefinitionFields } from './action_definition_fields'

const AUTO_SAVE_DELAY_MS = 500

interface ActionEditorProps {
    action: ActionDefinition
    actions: ActionDefinition[]
    repositoryFiles: string[]
    states: string[]
}

export function ActionEditor(props: ActionEditorProps) {
    const { action, actions, repositoryFiles, states } = props
    const sourcePath = action.sourcePath
    if (!sourcePath) throw new Error(`Action editor requires a persisted action: ${action.id}`)

    const [definition, setDefinition] = useState<RawActionDefinition>(() => editableActionDefinition(action))
    const [isSaving, setIsSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const savedContent = useRef(serializeActionDefinition(definition))

    const validation = useMemo(
        () => actionService.validateDefinition(sourcePath, definition),
        [definition, sourcePath],
    )
    const errors = useMemo(() => (
        validation.error && validation.field ? { [validation.field]: validation.error } : {}
    ), [validation.error, validation.field])

    useEffect(() => {
        const content = serializeActionDefinition(definition)
        if (!validation.valid || content === savedContent.current) return undefined

        const timeout = window.setTimeout(async () => {
            setIsSaving(true)
            setSaveError(null)
            try {
                await actionService.saveDefinition(sourcePath, definition)
                savedContent.current = content
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Action save failed'
                setSaveError(message)
                dialogService.error(error, { fallbackMessage: message })
            } finally {
                setIsSaving(false)
            }
        }, AUTO_SAVE_DELAY_MS)

        return () => window.clearTimeout(timeout)
    }, [definition, sourcePath, validation.valid])

    const handleDefinitionChange = (nextDefinition: RawActionDefinition) => {
        setDefinition(nextDefinition)
    }

    const handlePromptChange = (prompt: string) => {
        setDefinition((current) => ({ ...current, prompt }))
    }

    const selectableActions = actions.filter(({ id }) => id !== action.id)
    const status = isSaving ? 'Saving…' : validation.valid ? 'Changes save automatically.' : 'Fix validation errors to save.'

    return (
        <Box>
            {saveError ? <Alert severity="error" sx={{ mb: 2 }}>{saveError}</Alert> : null}
            <ActionDefinitionFields
                actions={selectableActions}
                definition={definition}
                errors={errors}
                onChange={handleDefinitionChange}
                repositoryFiles={repositoryFiles}
                states={states}
            />
            {definition.type === 'agent' ? (
                <Box>
                    <Typography component="h2" sx={{ mb: 1 }} variant="h6">Prompt</Typography>
                    {errors.prompt ? <FormHelperText error>{errors.prompt}</FormHelperText> : null}
                    <MarkdownEditor key={action.id} markdown={definition.prompt ?? ''} onChange={handlePromptChange} />
                </Box>
            ) : null}
            <Typography color={validation.valid ? 'text.secondary' : 'error'} sx={{ mt: 1 }} variant="caption">
                {status}
            </Typography>
        </Box>
    )
}
