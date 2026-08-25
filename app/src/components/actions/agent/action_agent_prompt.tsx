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
const DEFAULT_PROMPT_HEIGHT = 140
const EMPTY_PROMPT_EDITOR_HEIGHT = 56
const PROMPT_RESIZE_STEP = 24
const PROMPT_HEIGHT_STORAGE_KEY = 'md2.actionPromptHeight'

function readStoredPromptHeight(): number {
    const storedValue = applicationStorage.getItem(PROMPT_HEIGHT_STORAGE_KEY)
    const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : Number.NaN

    return Number.isNaN(parsedValue) ? DEFAULT_PROMPT_HEIGHT : parsedValue
}

function persistPromptHeight(height: number) {
    applicationStorage.setItem(PROMPT_HEIGHT_STORAGE_KEY, String(Math.round(height)))
}

interface ActionAgentPromptProps {
    attachmentHandler?: (files: File[], insertMarkdown: (markdown: string) => void) => Promise<void>
    bottomRow?: ReactNode
    convertMessage: string | null
    onRunShortcut?: () => void
    promptDraft: ActionPromptDraft
    responsePrompts?: ReactNode
}

/** Resizable prompt editor shown below an agent conversation. */
export function ActionAgentPrompt(props: ActionAgentPromptProps) {
    const {attachmentHandler, bottomRow, convertMessage, onRunShortcut, promptDraft, responsePrompts} = props
    const promptEditorRef = useRef<MarkdownEditorHandle>(null)
    const promptHeightStartRef = useRef(0)
    const pointerStartYRef = useRef(0)
    const promptSurfaceRef = useRef<HTMLElement | null>(null)
    const [promptHeight, setPromptHeight] = useState(readStoredPromptHeight)
    const [resizingPrompt, setResizingPrompt] = useState(false)
    const prompt = useSyncExternalStore(promptDraft.subscribe, promptDraft.getSnapshot, promptDraft.getSnapshot)
    const editorSnapshot = useSyncExternalStore(
        promptDraft.subscribeEditor,
        promptDraft.getEditorSnapshot,
        promptDraft.getEditorSnapshot,
    )

    const promptEmpty = prompt.trim().length === 0

    const handleLivePromptChange = (value: string) => {
        if (value.trim().length === 0) setResizingPrompt(false)
    }

    const clampPromptHeight = useCallback((proposed: number) => {
        const container = promptSurfaceRef.current?.parentElement
        const available = container ? container.getBoundingClientRect().height - MIN_CHAT_HEIGHT : proposed
        const max = Math.max(MIN_PROMPT_HEIGHT, available)

        return Math.min(Math.max(proposed, MIN_PROMPT_HEIGHT), max)
    }, [])

    const handlePromptSurfaceRef = useCallback((surface: HTMLElement | null) => {
        promptSurfaceRef.current = surface
        if (!surface || promptEmpty) return

        setPromptHeight((height) => {
            const clamped = clampPromptHeight(height)
            if (clamped !== height) persistPromptHeight(clamped)

            return clamped
        })
    }, [clampPromptHeight, promptEmpty])

    const handleSplitPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (promptEmpty) return

        event.preventDefault()
        promptHeightStartRef.current = promptHeight
        pointerStartYRef.current = event.clientY
        setResizingPrompt(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handleSplitPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (promptEmpty || !resizingPrompt) return

        const delta = pointerStartYRef.current - event.clientY
        setPromptHeight(clampPromptHeight(promptHeightStartRef.current + delta))
    }

    const handleSplitPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!resizingPrompt) return

        setResizingPrompt(false)
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        if (promptEmpty) return

        setPromptHeight((height) => {
            persistPromptHeight(height)

            return height
        })
    }

    const handleSplitKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (promptEmpty) return

        const nextByKey: Record<string, number> = {
            ArrowDown: promptHeight - PROMPT_RESIZE_STEP,
            ArrowUp: promptHeight + PROMPT_RESIZE_STEP,
        }
        const next = nextByKey[event.key]
        if (next === undefined) return

        event.preventDefault()
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
                aria-label="Resize prompt"
                aria-disabled={promptEmpty ? 'true' : undefined}
                aria-orientation="horizontal"
                aria-valuemin={MIN_PROMPT_HEIGHT}
                aria-valuenow={Math.round(promptHeight)}
                onKeyDown={handleSplitKeyDown}
                onPointerDown={handleSplitPointerDown}
                onPointerMove={handleSplitPointerMove}
                onPointerUp={handleSplitPointerUp}
                role="separator"
                sx={{
                    bgcolor: resizingPrompt && !promptEmpty ? 'primary.main' : 'divider',
                    borderRadius: '2px',
                    cursor: promptEmpty ? 'default' : 'row-resize',
                    flexShrink: 0,
                    height: '3px',
                    mx: 'auto',
                    my: '2px',
                    width: '100%',
                    '&:hover': { bgcolor: promptEmpty ? 'divider' : 'primary.main' },
                }}
                tabIndex={promptEmpty ? -1 : 0}
            />
            <Box
                aria-label="Prompt"
                onKeyDownCapture={handlePromptKeyDownCapture}
                ref={handlePromptSurfaceRef}
                sx={{
                    borderRadius: '9px',
                    border: 1,
                    borderColor: 'custom.borderStrong',
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0,
                    height: promptEmpty ? 'auto' : promptHeight,
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
                        draft={promptDraft.markdownDraft}
                        flushOnBlur
                        hideAttachmentControl
                        hideToolbar
                        localTextSearch={false}
                        onLiveChange={handleLivePromptChange}
                        placeholders={ACTION_PROMPT_PLACEHOLDERS}
                        readOnly={editorSnapshot.preparationStatus !== 'ready'}
                        ref={promptEditorRef}
                    />
                </Box>
                {responsePrompts}
                {bottomRow}
            </Box>
            {convertMessage ? (
                <Typography color="text.secondary" role="status" variant="caption">
                    {convertMessage}
                </Typography>
            ) : null}
        </>
    )
}
