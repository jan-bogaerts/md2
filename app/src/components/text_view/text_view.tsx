import { Box, Button, Drawer, Paper, TextField, Typography } from '@mui/material'
import FolderOutline from 'mdi-material-ui/FolderOutline'
import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { buildFileTree, fileLabel } from '../../data/file_tree'
import type { ProjectCard } from '../../data/data_types'
import { FileTreeView } from './file_tree_view'
import { TabBar, type OpenTab } from './tab_bar'
import { useOpenTabs } from './use_open_tabs'

const TREE_WIDTH = 280
const EDITOR_MIN_ROWS = 12

interface TextViewProps {
    activeCards: ProjectCard[]
    backgroundCards: ProjectCard[]
    isMobile: boolean
    onBodyChange: (path: string, body: string) => void
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
    const { activeCards, backgroundCards, isMobile, onBodyChange, requestedNonce, requestedPath, workingFolder } = props
    const { activePath, activateTab, closeTab, openTab, tabs } = useOpenTabs()
    const [isTreeOpen, setIsTreeOpen] = useState(false)

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
        if (requestedPath) openTab(requestedPath)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requestedNonce])

    const openTabs: OpenTab[] = tabs.map((path) => ({ label: tabLabel(cardsByPath, path), path }))
    const activeCard = activePath ? cardsByPath.get(activePath) ?? null : null

    const handleSelect = (path: string) => {
        openTab(path)
        setIsTreeOpen(false)
    }

    const handleEditorChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        if (activePath) onBodyChange(activePath, event.target.value)
    }

    const treeContent = (
        <Box aria-label="File tree" sx={{ overflow: 'auto' }}>
            <FileTreeView nodes={tree} onSelect={handleSelect} selectedPath={activePath} />
        </Box>
    )

    const editorPane = (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
            <TabBar activePath={activePath} onActivate={activateTab} onClose={closeTab} tabs={openTabs} />
            <Box sx={{ flex: 1, p: 2 }}>
                {activeCard ? (
                    <TextField
                        fullWidth
                        minRows={EDITOR_MIN_ROWS}
                        multiline
                        onChange={handleEditorChange}
                        slotProps={{ htmlInput: { 'aria-label': 'File editor' } }}
                        value={activeCard.content}
                    />
                ) : (
                    <Typography color="text.secondary" variant="body2">
                        Select a file from the tree to open it.
                    </Typography>
                )}
            </Box>
        </Box>
    )

    if (isMobile) {
        return (
            <Box>
                <Button onClick={() => setIsTreeOpen(true)} startIcon={<FolderOutline />} sx={{ mb: 1 }}>
                    Browse files
                </Button>
                <Drawer anchor="left" onClose={() => setIsTreeOpen(false)} open={isTreeOpen}>
                    <Box sx={{ width: TREE_WIDTH }}>{treeContent}</Box>
                </Drawer>
                {editorPane}
            </Box>
        )
    }

    return (
        <Box sx={{ display: 'flex', minHeight: 0 }}>
            <Paper
                elevation={0}
                sx={{ borderColor: 'divider', borderRadius: 0, borderRight: 1, flexShrink: 0, overflow: 'auto', width: TREE_WIDTH }}
                variant="outlined"
            >
                {treeContent}
            </Paper>
            {editorPane}
        </Box>
    )
}
