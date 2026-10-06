import { Box, Typography } from '@mui/material'
import {
    useCallback, useLayoutEffect, useRef, useSyncExternalStore,
    type KeyboardEvent, type ReactNode,
} from 'react'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../../data/action_placeholders'
import type { ActionPromptDraft } from '../../../services/actions/action_prompt_draft_service'
import type { ActionInputLayoutStore } from '../run/popup/action_input_layout_store';
import { useBoundRunId, useRunSelector } from '../../hooks/use_action_runs'
import { MarkdownEditor, type MarkdownEditorHandle } from '../../editor/markdown_editor'
import { ActionAgentQuestionOwner, type RestoredAgentQuestions } from './action_agent_question_owner'
import type { ActionRunBindingStore } from '../run/state/action_run_binding_store'

const EMPTY_PROMPT_EDITOR_HEIGHT = 56;

interface ActionAgentPromptProps {
    attachmentHandler?: (files: File[], insertMarkdown: (markdown: string) => void) => Promise<void>
    bindingStore: ActionRunBindingStore
    layoutStore: ActionInputLayoutStore;
    bottomRow?: ReactNode
    convertMessage: string | null
    monospace?: boolean
    /** Exchange literal text with the editor; set for command actions. */
    plainText?: boolean
    onRunShortcut?: () => void
    promptDraft: ActionPromptDraft
    questionsEnabled: boolean
    responsePrompts?: ReactNode
    restoredQuestions?: RestoredAgentQuestions | null
}

/** Draft editor and pending questions; action layouts own their separator and resize state. */
export function ActionAgentPrompt(props: ActionAgentPromptProps) {
    const {
        attachmentHandler, bindingStore, bottomRow, convertMessage, layoutStore, monospace = false, onRunShortcut, plainText = false,
        promptDraft, questionsEnabled, responsePrompts, restoredQuestions = null,
    } = props
    const promptEditorRef = useRef<MarkdownEditorHandle>(null)
    const layout = useSyncExternalStore(layoutStore.subscribe, layoutStore.getSnapshot, layoutStore.getSnapshot);
    const prompt = useSyncExternalStore(promptDraft.subscribe, promptDraft.getSnapshot, promptDraft.getSnapshot)
    const editorSnapshot = useSyncExternalStore(
        promptDraft.subscribeEditor,
        promptDraft.getEditorSnapshot,
        promptDraft.getEditorSnapshot,
    )
    const boundRunId = useBoundRunId(bindingStore)
    const question = useRunSelector(boundRunId, (run) => run?.question ?? null)

    const promptEmpty = prompt.trim().length === 0
    const hasQuestions = questionsEnabled && !!(question || restoredQuestions)
    const questionIdentity = questionsEnabled
        ? question?.requestId ?? restoredQuestions?.questions ?? null
        : null
    useLayoutEffect(() => {
        layoutStore.setInput(promptEmpty, questionIdentity);
    }, [layoutStore, promptEmpty, questionIdentity]);
    const activeBlockHeight = hasQuestions ? layout.blockHeight : null;
    const effectivePromptHeight = layout.promptHeight;
    const questionsMaxHeight = layout.questionsMaxHeight;
    const primaryRegion = layout.primaryRegion;

    const handlePromptBlock = useCallback((surface: HTMLElement | null) => {
        layoutStore.attachPromptBlock(surface);
    }, [layoutStore]);
    const handleQuestionsSurface = useCallback((surface: HTMLElement | null) => {
        layoutStore.attachQuestions(surface);
    }, [layoutStore]);
    const handleLiveChange = (value: string) => layoutStore.activatePrompt(value);
    const handleQuestionsActivate = () => layoutStore.activateQuestions();

    const handlePromptKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || !onRunShortcut) return

        event.preventDefault()
        event.stopPropagation()
        promptEditorRef.current?.flush()
        onRunShortcut()
    }

    return (
        <>
            <Box
                data-testid="action-prompt-block"
                ref={handlePromptBlock}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0,
                    gap: 1,
                    height: activeBlockHeight ?? 'auto',
                    maxHeight: layout.maximum,
                    overflowY: 'auto',
                    minHeight: 0,
                }}
            >
                <Box
                    aria-label="Prompt"
                    onKeyDownCapture={handlePromptKeyDownCapture}
                    sx={{
                        borderRadius: '9px',
                        border: 1,
                        borderColor: 'custom.borderStrong',
                        display: 'flex',
                        flexDirection: 'column',
                        flexShrink: 0,
                        height: promptEmpty && activeBlockHeight === null ? 'auto' : effectivePromptHeight,
                        minHeight: hasQuestions ? layout.promptMinHeight : undefined,
                        overflow: 'hidden',
                        '&:focus-within': {
                            borderColor: 'primary.main',
                            boxShadow: (theme) => `0 0 0 3px ${theme.palette.action.selected}`,
                        },
                    }}
                >
                    <Box
                        data-testid="action-prompt-editor-region"
                        sx={{
                            flex: promptEmpty ? '0 0 auto' : 1,
                            height: promptEmpty ? EMPTY_PROMPT_EDITOR_HEIGHT : undefined,
                            mb: promptEmpty ? -1.5 : 1,
                            minHeight: 0,
                            overflowY: 'auto',
                            px: 1,
                        }}
                    >
                        <MarkdownEditor
                            attachmentHandler={attachmentHandler}
                            draft={promptDraft.editorDraft}
                            flushOnBlur
                            hideAttachmentControl
                            hideToolbar
                            localTextSearch={false}
                            monospace={monospace}
                            onLiveChange={handleLiveChange}
                            placeholders={ACTION_PROMPT_PLACEHOLDERS}
                            plainText={plainText}
                            readOnly={editorSnapshot.preparationStatus !== 'ready'}
                            ref={promptEditorRef}
                        />
                    </Box>
                    {responsePrompts}
                    {bottomRow}
                </Box>
                {hasQuestions ? (
                    <Box
                        data-testid="action-questions-region"
                        onFocusCapture={handleQuestionsActivate}
                        onPointerDown={handleQuestionsActivate}
                        ref={handleQuestionsSurface}
                        sx={{
                            flex: activeBlockHeight === null
                                ? '0 1 auto'
                                : primaryRegion === 'questions' ? 1 : '0 0 auto',
                            height: activeBlockHeight !== null && primaryRegion === 'prompt'
                                ? layout.questionsMinHeight
                                : undefined,
                            maxHeight: activeBlockHeight === null ? questionsMaxHeight : undefined,
                            minHeight: activeBlockHeight === null ? 0 : layout.questionsMinHeight,
                            overflowY: 'auto',
                        }}
                    >
                        <ActionAgentQuestionOwner bindingStore={bindingStore} restored={restoredQuestions} />
                    </Box>
                ) : null}
            </Box>
            {convertMessage ? (
                <Typography color="text.secondary" role="status" variant="caption">
                    {convertMessage}
                </Typography>
            ) : null}
        </>
    )
}
