import { Box, Button, Collapse, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { useSortable } from '@dnd-kit/sortable'
import { useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { ProjectCard } from '../../data/data_types'
import { CardBodyEditor } from './card_body_editor'
import { PolicyLed } from './policy_led'

const TYPE_LINE_WIDTH = 4

export interface CardHandlers {
    onBodyChange: (path: string, body: string) => void
    onOpenBody: (path: string) => void
    onOpenInFileMode: (path: string) => void
    onTogglePolicy: (path: string, policyKey: string) => void
    onTitleChange: (path: string, title: string) => void
}

interface ProjectCardViewProps extends CardHandlers {
    card: ProjectCard
    color?: string
    isBodyOpen: boolean
    isMobile: boolean
}

/** A single card: type-color line, id + title, policy leds, drag handle and body access. */
export function ProjectCardView(props: ProjectCardViewProps) {
    const { card, color, isBodyOpen, isMobile, onBodyChange, onOpenBody, onOpenInFileMode, onTogglePolicy, onTitleChange } = props
    const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id: card.path })
    const [isEditingTitle, setIsEditingTitle] = useState(false)
    const [titleDraft, setTitleDraft] = useState(card.header.title)

    const style = {
        opacity: isDragging ? 0.5 : 1,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
    }

    const startEditingTitle = (event: MouseEvent) => {
        event.stopPropagation()
        setTitleDraft(card.header.title)
        setIsEditingTitle(true)
    }

    const commitTitle = () => {
        setIsEditingTitle(false)
        const nextTitle = titleDraft.trim()
        if (nextTitle.length > 0 && nextTitle !== card.header.title) onTitleChange(card.path, nextTitle)
    }

    const handleTitleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Enter') commitTitle()
        if (event.key === 'Escape') setIsEditingTitle(false)
    }

    const handleCardClick = () => {
        if (!isEditingTitle) onOpenBody(card.path)
    }

    const stopClick = (event: MouseEvent) => {
        event.stopPropagation()
    }

    const policyKeys = Object.keys(card.header.policy)

    return (
        <Box
            ref={setNodeRef}
            sx={{
                bgcolor: 'background.paper',
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                display: 'flex',
                overflow: 'hidden',
                ...style,
            }}
        >
            <Box sx={{ bgcolor: color ?? 'transparent', flexShrink: 0, width: TYPE_LINE_WIDTH }} />
            <Box sx={{ flex: 1, minWidth: 0, p: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <Tooltip title="Drag to reorder">
                        <IconButton
                            aria-label={`Drag ${card.header.id}`}
                            size="small"
                            sx={{ cursor: 'grab', touchAction: 'none' }}
                            {...attributes}
                            {...listeners}
                        >
                            <Box aria-hidden component="span">⠿</Box>
                        </IconButton>
                    </Tooltip>
                    <Box
                        onClick={handleCardClick}
                        sx={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                    >
                        {isEditingTitle ? (
                            <TextField
                                autoFocus
                                onBlur={commitTitle}
                                onChange={(event) => setTitleDraft(event.target.value)}
                                onClick={stopClick}
                                onKeyDown={handleTitleKeyDown}
                                size="small"
                                value={titleDraft}
                            />
                        ) : (
                            <Typography onDoubleClick={startEditingTitle} variant="subtitle2">
                                <Box component="span" sx={{ color: 'text.secondary', mr: 0.5 }}>
                                    {card.header.id}
                                </Box>
                                {card.header.title}
                            </Typography>
                        )}
                    </Box>
                    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, pt: 0.5 }}>
                        {policyKeys.map((policyKey) => (
                            <PolicyLed
                                key={policyKey}
                                enabled={card.header.policy[policyKey] === 'true'}
                                onToggle={(key) => onTogglePolicy(card.path, key)}
                                policyKey={policyKey}
                            />
                        ))}
                    </Stack>
                </Stack>
                {isMobile ? (
                    <Collapse in={isBodyOpen} unmountOnExit>
                        <Box onClick={stopClick} sx={{ pt: 1 }}>
                            <CardBodyEditor card={card} isMobile={isMobile} onBodyChange={onBodyChange} />
                            <Button onClick={() => onOpenInFileMode(card.path)} size="small" sx={{ mt: 1 }}>
                                Open in file mode
                            </Button>
                        </Box>
                    </Collapse>
                ) : null}
            </Box>
        </Box>
    )
}
