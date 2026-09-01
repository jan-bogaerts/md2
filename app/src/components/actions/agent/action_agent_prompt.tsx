import { Box, Typography } from '@mui/material'
import {
    useCallback, useRef, useState, useSyncExternalStore,
    type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react'
import { ACTION_PROMPT_PLACEHOLDERS } from '../../../data/action_placeholders'
import type { ActionPromptDraft } from '../../../services/actions/action_prompt_draft_service'
import { applicationStorage } from '../../../services/storage/application_storage'
import { MarkdownEditor, type MarkdownEditorHandle } from '../../editor/markdown_editor'

const MIN_PROMPT_HEIGHT = 72
const MIN_CHAT_HEIGHT = 96
const MIN_QUESTIONS_HEIGHT = 96
const QUESTIONS_INITIAL_MAX_FRACTION = 0.4
const MIN_BLOCK_HEIGHT = MIN_PROMPT_HEIGHT + MIN_QUESTIONS_HEIGHT
const DEFAULT_PROMPT_HEIGHT = 140
const EMPTY_PROMPT_EDITOR_HEIGHT = 56
const PROMPT_RESIZE_STEP = 24
const PROMPT_HEIGHT_STORAGE_KEY = 'md2.actionPromptHeight'
const QUESTIONS_BLOCK_HEIGHT_STORAGE_KEY = 'md2.actionQuestionsBlockHeight'

function readStoredPromptHeight(): number {
    const storedValue = applicationStorage.getItem(PROMPT_HEIGHT_STORAGE_KEY)
    const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : Number.NaN

    return Number.isNaN(parsedValue) ? DEFAULT_PROMPT_HEIGHT : parsedValue
}

function persistPromptHeight(height: number) {
    applicationStorage.setItem(PROMPT_HEIGHT_STORAGE_KEY, String(Math.round(height)))
}

function readStoredBlockHeight(): number | null {
    const storedValue = applicationStorage.getItem(QUESTIONS_BLOCK_HEIGHT_STORAGE_KEY)
    const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : Number.NaN

    return Number.isNaN(parsedValue) ? null : parsedValue
}

function persistBlockHeight(height: number) {
    applicationStorage.setItem(QUESTIONS_BLOCK_HEIGHT_STORAGE_KEY, String(Math.round(height)))
}

interface ActionAgentPromptProps {
    attachmentHandler?: (files: File[], insertMarkdown: (markdown: string) => void) => Promise<void>
    bottomRow?: ReactNode
    convertMessage: string | null
    monospace?: boolean
    onRunShortcut?: () => void
    promptDraft: ActionPromptDraft
    questionsPanel?: ReactNode
    responsePrompts?: ReactNode
}

/** Resizable prompt editor, plus any pending agent question, shown below an agent conversation. */
export function ActionAgentPrompt(props: ActionAgentPromptProps) {
    const {
        attachmentHandler, bottomRow, convertMessage, monospace = false, onRunShortcut, promptDraft, questionsPanel,
        responsePrompts,
    } = props
    const promptEditorRef = useRef<MarkdownEditorHandle>(null)
    const promptHeightStartRef = useRef(0)
    const blockHeightStartRef = useRef(0)
    const pointerStartYRef = useRef(0)
    const blockSurfaceRef = useRef<HTMLElement | null>(null)
    const questionsSurfaceRef = useRef<HTMLElement | null>(null)
    const [promptHeight, setPromptHeight] = useState(readStoredPromptHeight)
    const [blockHeight, setBlockHeight] = useState<number | null>(null)
    const [containerHeight, setContainerHeight] = useState(0)
    const [resizingPrompt, setResizingPrompt] = useState(false)
    const prompt = useSyncExternalStore(promptDraft.subscribe, promptDraft.getSnapshot, promptDraft.getSnapshot)
    const editorSnapshot = useSyncExternalStore(
        promptDraft.subscribeEditor,
        promptDraft.getEditorSnapshot,
        promptDraft.getEditorSnapshot,
    )

    const promptEmpty = prompt.trim().length === 0
    const hasQuestions = !!questionsPanel
    const resizeDisabled = promptEmpty && !hasQuestions

    const handleLivePromptChange = (value: string) => {
        if (value.trim().length === 0) setResizingPrompt(false)
    }

    const measureContainerHeight = useCallback(() => {
        const container = blockSurfaceRef.current?.parentElement

        return container ? container.getBoundingClientRect().height : 0
    }, [])

    const clampPromptHeight = useCallback((proposed: number) => {
        const container = measureContainerHeight()
        const questionsHeight = questionsSurfaceRef.current
            ? Math.max(MIN_QUESTIONS_HEIGHT, questionsSurfaceRef.current.getBoundingClientRect().height)
            : 0
        const available = container ? container - MIN_CHAT_HEIGHT - questionsHeight : proposed
        const max = Math.max(MIN_PROMPT_HEIGHT, available)

        return Math.min(Math.max(proposed, MIN_PROMPT_HEIGHT), max)
    }, [measureContainerHeight])

    const clampBlockHeight = useCallback((proposed: number) => {
        const container = measureContainerHeight()
        const available = container ? container - MIN_CHAT_HEIGHT : proposed
        const max = Math.max(MIN_BLOCK_HEIGHT, available)

        return Math.min(Math.max(proposed, MIN_BLOCK_HEIGHT), max)
    }, [measureContainerHeight])

    /**
     * Measures the agent column and restores the stored block height. React re-runs this callback whenever a
     * question appears or disappears, because `hasQuestions` changes the callback identity.
     */
    const handleBlockSurfaceRef = useCallback((surface: HTMLElement | null) => {
        blockSurfaceRef.current = surface
        if (!surface) return

        setContainerHeight(measureContainerHeight())
        if (hasQuestions) {
            setBlockHeight((current) => {
                const stored = current ?? readStoredBlockHeight()

                return stored === null ? null : clampBlockHeight(stored)
            })
        }
        if (promptEmpty) return

        setPromptHeight((height) => {
            const clamped = clampPromptHeight(height)
            if (clamped !== height) persistPromptHeight(clamped)

            return clamped
        })
    }, [clampBlockHeight, clampPromptHeight, hasQuestions, measureContainerHeight, promptEmpty])

    /** Height of the bottom block while a question is shown; null keeps the block content-sized. */
    const activeBlockHeight = hasQuestions ? blockHeight : null
    const effectivePromptHeight = activeBlockHeight === null
        ? promptHeight
        : Math.min(Math.max(promptHeight, MIN_PROMPT_HEIGHT), activeBlockHeight - MIN_QUESTIONS_HEIGHT)
    const questionsMaxHeight = Math.max(MIN_QUESTIONS_HEIGHT, containerHeight * QUESTIONS_INITIAL_MAX_FRACTION)

    const currentBlockHeight = () => {
        if (activeBlockHeight !== null) return activeBlockHeight

        const measured = blockSurfaceRef.current?.getBoundingClientRect().height ?? 0

        return clampBlockHeight(measured || MIN_BLOCK_HEIGHT)
    }

    const handleSplitPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (resizeDisabled) return

        event.preventDefault()
        promptHeightStartRef.current = promptHeight
        blockHeightStartRef.current = currentBlockHeight()
        pointerStartYRef.current = event.clientY
        setResizingPrompt(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handleSplitPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (resizeDisabled || !resizingPrompt) return

        const delta = pointerStartYRef.current - event.clientY
        if (hasQuestions) {
            setBlockHeight(clampBlockHeight(blockHeightStartRef.current + delta))

            return
        }

        setPromptHeight(clampPromptHeight(promptHeightStartRef.current + delta))
    }

    const handleSplitPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!resizingPrompt) return

        setResizingPrompt(false)
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        if (hasQuestions) {
            setBlockHeight((height) => {
                if (height !== null) persistBlockHeight(height)

                return height
            })

            return
        }
        if (promptEmpty) return

        setPromptHeight((height) => {
            persistPromptHeight(height)

            return height
        })
    }

    const handleSplitKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (resizeDisabled) return

        const base = hasQuestions ? currentBlockHeight() : promptHeight
        const nextByKey: Record<string, number> = {
            ArrowDown: base - PROMPT_RESIZE_STEP,
            ArrowUp: base + PROMPT_RESIZE_STEP,
        }
        const next = nextByKey[event.key]
        if (next === undefined) return

        event.preventDefault()
        if (hasQuestions) {
            const clampedBlock = clampBlockHeight(next)
            setBlockHeight(clampedBlock)
            persistBlockHeight(clampedBlock)

            return
        }

        const clamped = clampPromptHeight(next)
        setPromptHeight(clamped)
        persistPromptHeight(clamped)
    }

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
                aria-label={hasQuestions ? 'Resize prompt and questions' : 'Resize prompt'}
                aria-disabled={resizeDisabled ? 'true' : undefined}
                aria-orientation="horizontal"
                aria-valuemin={hasQuestions ? MIN_BLOCK_HEIGHT : MIN_PROMPT_HEIGHT}
                aria-valuenow={Math.round(hasQuestions
                    ? activeBlockHeight ?? effectivePromptHeight + questionsMaxHeight
                    : promptHeight)}
                onKeyDown={handleSplitKeyDown}
                onPointerDown={handleSplitPointerDown}
                onPointerMove={handleSplitPointerMove}
                onPointerUp={handleSplitPointerUp}
                role="separator"
                sx={{
                    bgcolor: resizingPrompt && !resizeDisabled ? 'primary.main' : 'divider',
                    borderRadius: '2px',
                    cursor: resizeDisabled ? 'default' : 'row-resize',
                    flexShrink: 0,
                    height: '3px',
                    mx: 'auto',
                    my: '2px',
                    width: '100%',
                    '&:hover': { bgcolor: resizeDisabled ? 'divider' : 'primary.main' },
                }}
                tabIndex={resizeDisabled ? -1 : 0}
            />
            <Box
                data-testid="action-prompt-block"
                ref={handleBlockSurfaceRef}
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0,
                    gap: 1,
                    height: activeBlockHeight ?? 'auto',
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
                            onLiveChange={handleLivePromptChange}
                            placeholders={ACTION_PROMPT_PLACEHOLDERS}
                            readOnly={editorSnapshot.preparationStatus !== 'ready'}
                            ref={promptEditorRef}
                        />
                    </Box>
                    {responsePrompts}
                    {bottomRow}
                </Box>
                {questionsPanel ? (
                    <Box
                        data-testid="action-questions-region"
                        ref={questionsSurfaceRef}
                        sx={{
                            flex: activeBlockHeight === null ? '0 1 auto' : 1,
                            maxHeight: activeBlockHeight === null ? questionsMaxHeight : undefined,
                            minHeight: 0,
                            overflowY: 'auto',
                        }}
                    >
                        {questionsPanel}
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
