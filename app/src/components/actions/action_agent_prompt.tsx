import { Box, Typography } from '@mui/material'
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { MarkdownEditor, type MarkdownEditorHandle } from '../editor/markdown_editor'
import type { ActionPromptDraft } from './action_prompt_draft'

const MIN_PROMPT_HEIGHT = 72
const MIN_CHAT_HEIGHT = 96
const DEFAULT_PROMPT_HEIGHT = 140
const PROMPT_RESIZE_STEP = 24
const PROMPT_HEIGHT_STORAGE_KEY = 'md2.actionPromptHeight'

function readStoredPromptHeight(): number {
    const storedValue = window.localStorage.getItem(PROMPT_HEIGHT_STORAGE_KEY)
    const parsedValue = storedValue ? Number.parseInt(storedValue, 10) : Number.NaN

    return Number.isNaN(parsedValue) ? DEFAULT_PROMPT_HEIGHT : parsedValue
}

interface ActionAgentPromptProps {
    convertMessage: string | null
    disabled: boolean
    onPromptChange: (value: string) => void
    onRunShortcut?: () => void
    promptDraft: ActionPromptDraft
    promptFailed: boolean
    promptLoading: boolean
}

/** Resizable prompt editor shown below an agent conversation. */
export function ActionAgentPrompt(props: ActionAgentPromptProps) {
    const {convertMessage, disabled, onPromptChange, onRunShortcut, promptDraft, promptFailed, promptLoading} = props
    const promptEditorRef = useRef<MarkdownEditorHandle>(null)
    const promptHeightStartRef = useRef(0)
    const pointerStartYRef = useRef(0)
    const splitContainerRef = useRef<HTMLElement | null>(null)
    const [promptHeight, setPromptHeight] = useState(readStoredPromptHeight)
    const [resizingPrompt, setResizingPrompt] = useState(false)

    useEffect(() => {
        promptEditorRef.current?.setMarkdown(promptDraft.getSnapshot())
    }, [promptDraft])

    const clampPromptHeight = (proposed: number) => {
        const container = splitContainerRef.current
        const available = container ? container.getBoundingClientRect().height - MIN_CHAT_HEIGHT : proposed
        const max = Math.max(MIN_PROMPT_HEIGHT, available)

        return Math.min(Math.max(proposed, MIN_PROMPT_HEIGHT), max)
    }

    const persistPromptHeight = (height: number) => {
        window.localStorage.setItem(PROMPT_HEIGHT_STORAGE_KEY, String(Math.round(height)))
    }

    const handleSplitPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault()
        splitContainerRef.current = event.currentTarget.parentElement
        promptHeightStartRef.current = promptHeight
        pointerStartYRef.current = event.clientY
        setResizingPrompt(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }

    const handleSplitPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!resizingPrompt) return

        const delta = pointerStartYRef.current - event.clientY
        setPromptHeight(clampPromptHeight(promptHeightStartRef.current + delta))
    }

    const handleSplitPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!resizingPrompt) return

        setResizingPrompt(false)
        event.currentTarget.releasePointerCapture?.(event.pointerId)
        setPromptHeight((height) => {
            persistPromptHeight(height)

            return height
        })
    }

    const handleSplitKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        splitContainerRef.current = event.currentTarget.parentElement
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

    const handlePromptKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey) || !onRunShortcut) return

        event.preventDefault()
        promptEditorRef.current?.flush()
        onRunShortcut()
    }

    return (
        <>
            <Box
                aria-label="Resize prompt"
                aria-orientation="horizontal"
                aria-valuemin={MIN_PROMPT_HEIGHT}
                aria-valuenow={Math.round(promptHeight)}
                onKeyDown={handleSplitKeyDown}
                onPointerDown={handleSplitPointerDown}
                onPointerMove={handleSplitPointerMove}
                onPointerUp={handleSplitPointerUp}
                role="separator"
                sx={{
                    bgcolor: resizingPrompt ? 'primary.main' : 'divider',
                    borderRadius: '2px',
                    cursor: 'row-resize',
                    flexShrink: 0,
                    height: '3px',
                    mx: 'auto',
                    my: '2px',
                    width: '100%',
                    '&:hover': { bgcolor: 'primary.main' },
                }}
                tabIndex={0}
            />
            <Box
                aria-label="Prompt"
                onKeyDown={handlePromptKeyDown}
                sx={{
                    borderRadius: '9px',
                    border: 1,
                    borderColor: (theme) => theme.palette.mode === 'dark' ? '#364152' : '#d5dbe3',
                    flexShrink: 0,
                    height: promptHeight,
                    overflowY: 'auto',
                    px: 1,
                    '&:focus-within': {
                        borderColor: 'primary.main',
                        boxShadow: (theme) => `0 0 0 3px ${theme.palette.action.selected}`,
                    },
                }}
            >
                <MarkdownEditor
                    flushOnBlur
                    hideToolbar
                    markdown={promptDraft.getSnapshot()}
                    onChange={onPromptChange}
                    onLiveChange={promptDraft.set}
                    readOnly={disabled || promptLoading || promptFailed}
                    ref={promptEditorRef}
                />
            </Box>
            {convertMessage ? (
                <Typography color="text.secondary" role="status" variant="caption">
                    {convertMessage}
                </Typography>
            ) : null}
        </>
    )
}
