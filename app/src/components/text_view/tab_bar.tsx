import { Box, IconButton, Tab, Tabs, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import CardsOutline from 'mdi-material-ui/CardsOutline'
import Close from 'mdi-material-ui/Close'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import LightningBolt from 'mdi-material-ui/LightningBolt'
import type { MouseEvent, SyntheticEvent } from 'react'
import type { OpenDocument } from '../../services/open_files_service'

export type OpenTabKind = 'action' | 'card' | 'markdown'

export interface OpenTab {
    color: string | null
    document: OpenDocument
    document: OpenDocument
    id: string | null
    kind: OpenTabKind
    label: string
    path: string
    title: string
}

interface TabBarProps {
    activeDocument: OpenDocument | null
    onActivate: (document: OpenDocument) => void
    onClose: (document: OpenDocument) => void
    tabs: OpenTab[]
}

/** Horizontal bar of compact open-file tabs with card identity and close buttons. */
export function TabBar(props: TabBarProps) {
    const { activeDocument, onActivate, onClose, tabs } = props
    const theme = useTheme()

    const handleChange = (_event: SyntheticEvent, value: OpenDocument) => {
        onActivate(value)
    }

    const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        const index = Number(event.currentTarget.dataset.index)
        const document = tabs[index]?.document
        if (!document) throw new Error('Missing document for tab close button')

        onClose(document)
    }

    return (
        <Box sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 40 }}>
            <Tabs
                onChange={handleChange}
                scrollButtons="auto"
                sx={{
                    minHeight: 40,
                    '& .MuiTabs-indicator': { height: 2 },
                    '& .MuiTab-root': {
                        color: 'text.secondary',
                        minHeight: 40,
                        minWidth: 0,
                        px: 1.5,
                        py: 0,
                        textTransform: 'none',
                    },
                    '& .MuiTab-root.Mui-selected': { color: 'text.primary' },
                }}
                value={activeDocument ?? false}
                variant="scrollable"
            >
                {tabs.map((tab) => (
                    <Tab
                        aria-label={tab.label}
                        key={tab.path}
                        component="div"
                        label={(
                            <Box sx={{ alignItems: 'center', display: 'flex', gap: 1, maxWidth: 240, minWidth: 0 }}>
                                {tab.kind === 'action' ? <LightningBolt sx={{ flexShrink: 0, fontSize: 16 }} titleAccess="Action file" /> : null}
                                {tab.kind === 'card' ? <CardsOutline sx={{ flexShrink: 0, fontSize: 16 }} titleAccess="Card" /> : null}
                                {tab.kind === 'markdown' ? <FileDocumentOutline sx={{ flexShrink: 0, fontSize: 16 }} titleAccess="Markdown file" /> : null}
                                {tab.id ? (
                                    <Box
                                        component="span"
                                        sx={{
                                            bgcolor: alpha(tab.color ?? theme.palette.primary.main, 0.16),
                                            borderRadius: '5px',
                                            color: tab.color ?? 'primary.main',
                                            flexShrink: 0,
                                            fontFamily: '"Roboto Mono", ui-monospace, monospace',
                                            fontSize: 11.5,
                                            fontWeight: 600,
                                            px: 0.875,
                                            py: 0.25,
                                        }}
                                    >
                                        {tab.id}
                                    </Box>
                                ) : null}
                                <Box component="span" sx={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {tab.title}
                                </Box>
                                <IconButton
                                    aria-label={`Close ${tab.label}`}
                                    component="span"
                                    data-index={tabs.indexOf(tab)}
                                    onClick={handleClose}
                                    size="small"
                                    sx={{ color: 'text.disabled', flexShrink: 0, height: 20, width: 20 }}
                                >
                                    <Close sx={{ fontSize: 15 }} />
                                </IconButton>
                            </Box>
                        )}
                        value={tab.document}
                    />
                ))}
            </Tabs>
        </Box>
    )
}
