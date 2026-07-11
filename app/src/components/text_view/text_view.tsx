import { Badge, Box, Button, Divider, Stack, Typography } from '@mui/material'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildFileTree, fileLabel } from '../../data/file_tree'
import { defaultColumnAccent, type AgentConversation, type CardTypeConfig, type ProjectCard, type StateConfig } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry_service'
import { AgentConversationList } from '../agents/agent_conversation_list'
import { MarkdownEditor } from '../editor/markdown_editor'
import { LeftPanelSlot } from '../shell/left_panel_slot'
import { FileTreeView } from './file_tree_view'
import { HeaderEditorPanel } from './header_editor_panel'
import { TabBar, type OpenTab } from './tab_bar'
import { useOpenTabs } from './use_open_tabs'

const CONVERSATION_PANEL_MIN_HEIGHT = 220
const CONVERSATION_PANEL_MAX_HEIGHT_RATIO = 0.8
const CONVERSATION_PANEL_SEPARATOR_HEIGHT = 6
const CONVERSATION_PANEL_KEYBOARD_STEP = 24

interface TextViewProps {
    activeCards: ProjectCard[]
    backgroundCards: ProjectCard[]
    cardTypes: CardTypeConfig[]
    isMobile: boolean
    onLeftPanelInteraction: () => void
    onBodyChange: (path: string, body: string) => void
    onContinueAgentConversation: (path: string, conversation: AgentConversation) => void
    onDeleteFile: (path: string) => Promise<void>
    onHeaderFieldChange: (path: string, key: string, value: string) => void
    onSendAgentInput: (runId: string, input: string) => void
    onStartAgentConversation: (path: string, prompt: string) => void
    requestedNonce: number
    requestedPath: string | null
    states: StateConfig[]
    workingFolder: string
}

function cardTypeColor(card: ProjectCard, cardTypes: CardTypeConfig[]) {
    const idPrefix = card.header.id.split('-')[0]
    const cardType = cardTypes.find((candidate) => candidate.idPrefix === idPrefix)

    return cardType?.color ?? null
}

function tabData(cardsByPath: Map<string, ProjectCard>, cardTypes: CardTypeConfig[], path: string): OpenTab {
    const card = cardsByPath.get(path)
    const label = card ? fileLabel(card) : path
    const id = card && label.startsWith(`${card.header.id} `) ? card.header.id : null

    return { color: card ? cardTypeColor(card, cardTypes) : null, id, label, path, title: id ? label.slice(id.length + 1) : label }
}

function conversationPanelMaxHeight(containerHeight: number): number {
    return Math.max(CONVERSATION_PANEL_MIN_HEIGHT, containerHeight * CONVERSATION_PANEL_MAX_HEIGHT_RATIO)
}

function clampConversationPanelHeight(proposedHeight: number, containerHeight: number): number {
    const maxHeight = conversationPanelMaxHeight(containerHeight)
    return Math.min(Math.max(proposedHeight, CONVERSATION_PANEL_MIN_HEIGHT), maxHeight)
}

/** Text view: a folder/status tree plus tabbed, editable open files. */
export function TextView(props: TextViewProps) {
    const {
        activeCards,
        backgroundCards,
        cardTypes,
        isMobile,
        onLeftPanelInteraction,
        onBodyChange,
        onContinueAgentConversation,
        onDeleteFile,
        onHeaderFieldChange,
        onSendAgentInput,
        onStartAgentConversation,
        requestedNonce,
        requestedPath,
        states,
        workingFolder,
    } = props
    const [isConversationPanelOpen, setIsConversationPanelOpen] = useState(false)
    const [conversationPanelHeight, setConversationPanelHeight] = useState(CONVERSATION_PANEL_MIN_HEIGHT)
    const [isConversationPanelDragging, setIsConversationPanelDragging] = useState(false)
    const [conversationPanelMax, setConversationPanelMax] = useState<number | undefined>(undefined)
    const editorStackRef = useRef<HTMLDivElement>(null)
    const onDeleteFileRef = useRef(onDeleteFile)
    const onLeftPanelInteractionRef = useRef(onLeftPanelInteraction)

    const tree = useMemo(
        () => buildFileTree(activeCards, backgroundCards, workingFolder),
        [activeCards, backgroundCards, workingFolder],
    )
    const cardsByPath = useMemo(() => {
        const map = new Map<string, ProjectCard>()
        for (const card of [...activeCards, ...backgroundCards]) map.set(card.path, card)

        return map
    }, [activeCards, backgroundCards])
    const availablePaths = useMemo(() => [...cardsByPath.keys()], [cardsByPath])
    const { activePath, activateTab, closeTab, openTab, tabs } = useOpenTabs(availablePaths)
    const statusColors = useMemo(() => new Map(
        tree
            .filter((node) => node.kind === 'status')
            .map((node, index) => {
                const configuredState = states.find(({ state }) => state === node.label)

                return [node.label, configuredState?.color ?? defaultColumnAccent(index)]
            }),
    ), [states, tree])

    useEffect(() => {
        onDeleteFileRef.current = onDeleteFile
        onLeftPanelInteractionRef.current = onLeftPanelInteraction
    })

    useEffect(() => {
        if (requestedPath) openTab(requestedPath)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedNonce])

    const openTabs = tabs.map((path) => tabData(cardsByPath, cardTypes, path))
    const activeCard = activePath ? cardsByPath.get(activePath) ?? null : null

    const handleSelect = useCallback((path: string) => {
        openTab(path)
        onLeftPanelInteractionRef.current()
        telemetryService.trackEvent('navigation')
    }, [openTab])

    const handleDeleteFile = useCallback(async (path: string) => {
        await onDeleteFileRef.current(path)
        closeTab(path)
        onLeftPanelInteractionRef.current()
    }, [closeTab])

    const handleActivateTab = (path: string) => {
        activateTab(path)
        telemetryService.trackEvent('navigation')
    }

    const handleEditorChange = (body: string) => {
        if (activePath) onBodyChange(activePath, body)
    }

    const handleHeaderFieldChange = (key: string, value: string) => {
        if (activePath) onHeaderFieldChange(activePath, key, value)
    }

    const handleToggleConversationPanel = () => {
        setIsConversationPanelOpen((current) => !current)
    }

    const handleContinueAgentConversation = (conversation: AgentConversation) => {
        if (activePath) onContinueAgentConversation(activePath, conversation)
    }

    const handleStartAgentConversation = (prompt: string) => {
        if (activePath) onStartAgentConversation(activePath, prompt)
    }

    const handleConversationPanelPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        event.preventDefault()
        if (editorStackRef.current) {
            const bounds = editorStackRef.current.getBoundingClientRect()
            setConversationPanelMax(conversationPanelMaxHeight(bounds.height))
        }
        setIsConversationPanelDragging(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
    }, [])

    const handleConversationPanelPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isConversationPanelDragging || !editorStackRef.current) return

        const bounds = editorStackRef.current.getBoundingClientRect()
        const proposedHeight = bounds.bottom - event.clientY
        setConversationPanelMax(conversationPanelMaxHeight(bounds.height))
        setConversationPanelHeight(clampConversationPanelHeight(proposedHeight, bounds.height))
    }, [isConversationPanelDragging])

    const handleConversationPanelPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isConversationPanelDragging) return

        setIsConversationPanelDragging(false)
        event.currentTarget.releasePointerCapture?.(event.pointerId)
    }, [isConversationPanelDragging])

    const handleConversationPanelKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!editorStackRef.current) return

        const bounds = editorStackRef.current.getBoundingClientRect()
        setConversationPanelMax(conversationPanelMaxHeight(bounds.height))
        const nextHeightByKey: Record<string, number> = {
            ArrowDown: conversationPanelHeight - CONVERSATION_PANEL_KEYBOARD_STEP,
            ArrowUp: conversationPanelHeight + CONVERSATION_PANEL_KEYBOARD_STEP,
            End: conversationPanelMaxHeight(bounds.height),
            Home: CONVERSATION_PANEL_MIN_HEIGHT,
        }
        const nextHeight = nextHeightByKey[event.key]
        if (nextHeight === undefined) return

        event.preventDefault()
        setConversationPanelHeight(clampConversationPanelHeight(nextHeight, bounds.height))
    }, [conversationPanelHeight])

    const conversationPanelSeparator = !isMobile ? (
        <Box
            aria-label="Resize conversation panel"
            aria-orientation="horizontal"
            aria-valuemax={conversationPanelMax}
            aria-valuemin={CONVERSATION_PANEL_MIN_HEIGHT}
            aria-valuenow={Math.round(conversationPanelHeight)}
            onKeyDown={handleConversationPanelKeyDown}
            onPointerDown={handleConversationPanelPointerDown}
            onPointerMove={handleConversationPanelPointerMove}
            onPointerUp={handleConversationPanelPointerUp}
            role="separator"
            sx={{
                bgcolor: isConversationPanelDragging ? 'primary.main' : 'divider',
                cursor: 'row-resize',
                flexShrink: 0,
                height: CONVERSATION_PANEL_SEPARATOR_HEIGHT,
                '&:hover': { bgcolor: 'primary.main' },
            }}
            tabIndex={0}
        />
    ) : <Divider />

    const editorPane = (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
            <TabBar activePath={activePath} onActivate={handleActivateTab} onClose={closeTab} tabs={openTabs} />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', borderBottom: 1, borderColor: 'divider', px: 2, py: 1 }}>
                <Button
                    disabled={!activeCard}
                    onClick={handleToggleConversationPanel}
                    size="small"
                    variant={isConversationPanelOpen ? 'contained' : 'outlined'}
                >
                    <Badge
                        badgeContent={(activeCard?.agentConversations.length ?? 0) + (activeCard?.agentConversationErrors.length ?? 0)}
                        color="primary"
                        sx={{ mr: 1 }}
                    >
                        Agents
                    </Badge>
                </Button>
                {activeCard ? (
                    <Typography color="text.secondary" variant="body2">
                        {fileLabel(activeCard)}
                    </Typography>
                ) : null}
            </Stack>
            <Box ref={editorStackRef} sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
                <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                    {activeCard && activePath ? (
                        <>
                            {Object.keys(activeCard.headerFields).length > 0 ? (
                                <HeaderEditorPanel
                                    fields={activeCard.headerFields}
                                    key={`header:${activePath}`}
                                    onFieldChange={handleHeaderFieldChange}
                                    title={activeCard.header.title}
                                />
                            ) : null}
                            <MarkdownEditor
                                key={activePath}
                                markdown={activeCard.content}
                                onChange={handleEditorChange}
                                stickyToolbar={isMobile}
                            />
                        </>
                    ) : (
                        <Typography color="text.secondary" variant="body2">
                            Select a file from the tree to open it.
                        </Typography>
                    )}
                </Box>
                {isConversationPanelOpen && activeCard ? (
                    <>
                        {conversationPanelSeparator}
                        <Box
                            sx={{
                                flexShrink: 0,
                                height: isMobile ? undefined : conversationPanelHeight,
                                minHeight: CONVERSATION_PANEL_MIN_HEIGHT,
                                overflow: 'auto',
                                p: 2,
                            }}
                        >
                            <AgentConversationList
                                conversations={activeCard.agentConversations}
                                errors={activeCard.agentConversationErrors}
                                onContinue={handleContinueAgentConversation}
                                onSendInput={onSendAgentInput}
                                onStart={handleStartAgentConversation}
                            />
                        </Box>
                    </>
                ) : null}
            </Box>
        </Box>
    )

    return (
        <>
            <LeftPanelSlot>
                <Box aria-label="File tree" sx={{ bgcolor: 'action.hover', minHeight: '100%', mx: -2, overflow: 'auto' }}>
                    <FileTreeView
                        cardTypes={cardTypes}
                        cardsByPath={cardsByPath}
                        nodes={tree}
                        onDeleteFile={handleDeleteFile}
                        onSelect={handleSelect}
                        selectedPath={activePath}
                        statusColors={statusColors}
                    />
                </Box>
            </LeftPanelSlot>
            <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
                {editorPane}
            </Box>
        </>
    )
}
