import { Badge, Box, Button, Divider, Stack, Typography } from '@mui/material'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { buildFileTree, fileLabel } from '../../data/file_tree'
import type { AgentConversation, CardTypeConfig, ProjectCard } from '../../data/data_types'
import { telemetryService } from '../../services/telemetry_service'
import { AgentConversationList } from '../agents/agent_conversation_list'
import { MarkdownEditor } from '../editor/markdown_editor'
import { FileTreeView } from './file_tree_view'
import { HeaderEditorPanel } from './header_editor_panel'
import { TabBar, type OpenTab } from './tab_bar'
import { useOpenTabs } from './use_open_tabs'

const CONVERSATION_PANEL_MIN_HEIGHT = 220

interface TextViewProps {
    activeCards: ProjectCard[]
    backgroundCards: ProjectCard[]
    cardTypes: CardTypeConfig[]
    isMobile: boolean
    onLeftPanelContentChange: (content: ReactNode) => void
    onLeftPanelInteraction: () => void
    onBodyChange: (path: string, body: string) => void
    onContinueAgentConversation: (path: string, conversation: AgentConversation) => void
    onDeleteFile: (path: string) => Promise<void>
    onHeaderFieldChange: (path: string, key: string, value: string) => void
    onSendAgentInput: (runId: string, input: string) => void
    onStartAgentConversation: (path: string, prompt: string) => void
    requestedNonce: number
    requestedPath: string | null
    workingFolder: string
}

function tabLabel(cardsByPath: Map<string, ProjectCard>, path: string): string {
    const card = cardsByPath.get(path)

    return card ? fileLabel(card) : path
}

/** Text view: a folder/status tree plus tabbed, editable open files. */
export function TextView(props: TextViewProps) {
    const {
        activeCards,
        backgroundCards,
        cardTypes,
        isMobile,
        onLeftPanelContentChange,
        onLeftPanelInteraction,
        onBodyChange,
        onContinueAgentConversation,
        onDeleteFile,
        onHeaderFieldChange,
        onSendAgentInput,
        onStartAgentConversation,
        requestedNonce,
        requestedPath,
        workingFolder,
    } = props
    const { activePath, activateTab, closeTab, openTab, tabs } = useOpenTabs()
    const [isConversationPanelOpen, setIsConversationPanelOpen] = useState(false)
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

    useEffect(() => {
        onDeleteFileRef.current = onDeleteFile
        onLeftPanelInteractionRef.current = onLeftPanelInteraction
    })

    useEffect(() => {
        if (requestedPath) openTab(requestedPath)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedNonce])

    const openTabs: OpenTab[] = tabs.map((path) => ({ label: tabLabel(cardsByPath, path), path }))
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

    const treeContent = useMemo(() => (
        <Box aria-label="File tree" sx={{ overflow: 'auto' }}>
            <FileTreeView
                cardTypes={cardTypes}
                cardsByPath={cardsByPath}
                nodes={tree}
                onDeleteFile={handleDeleteFile}
                onSelect={handleSelect}
                selectedPath={activePath}
            />
        </Box>
    ), [activePath, cardTypes, cardsByPath, handleDeleteFile, handleSelect, tree])

    useEffect(() => {
        onLeftPanelContentChange(treeContent)
    }, [onLeftPanelContentChange, treeContent])

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
            <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
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
                        <Divider />
                        <Box sx={{ minHeight: CONVERSATION_PANEL_MIN_HEIGHT, overflow: 'auto', p: 2 }}>
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
        <Box sx={{ display: 'flex', minHeight: 0 }}>
            {editorPane}
        </Box>
    )
}
