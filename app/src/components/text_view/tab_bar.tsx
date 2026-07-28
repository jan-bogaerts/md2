import { Box, IconButton, Tab, Tabs, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import CardsOutline from 'mdi-material-ui/CardsOutline'
import Close from 'mdi-material-ui/Close'
import FileDocumentOutline from 'mdi-material-ui/FileDocumentOutline'
import LightningBolt from 'mdi-material-ui/LightningBolt'
import { useEffect, type MouseEvent, type SyntheticEvent } from 'react'
import { fileLabel } from '../../data/file_tree'
import { getCardIdPrefix } from '../../data/card_identifiers'
import type { CardTypeConfig, ProjectCard } from '../../data/data_types'
import { markdownParsingService } from '../../services/data/markdown_parsing_service'
import { openFilesService, type OpenDocument } from '../../services/open_files_service'
import { dialogService } from '../../services/dialog_service'
import { telemetryService } from '../../services/telemetry/telemetry_service'
import { useOpenFiles } from '../hooks/use_open_files'

type OpenTabKind = 'action' | 'card' | 'markdown'

interface OpenTab {
    color: string | null
    document: OpenDocument
    id: string | null
    key: string
    kind: OpenTabKind
    label: string
    title: string
}

interface TabBarProps {
    actionsFolder: string
    cardTypes: CardTypeConfig[]
}

function cardTypeColor(card: ProjectCard, cardTypes: CardTypeConfig[]) {
    const idPrefix = getCardIdPrefix(card.header.id)
    const cardType = cardTypes.find((candidate) => candidate.idPrefix === idPrefix)

    return cardType?.color ?? null
}

function isPathInFolder(path: string, folder: string) {
    const normalizedPath = path.replace(/\\/gu, '/')
    const normalizedFolder = folder.replace(/\\/gu, '/').replace(/\/+$/u, '')

    return normalizedPath.startsWith(`${normalizedFolder}/`)
}

function tabKind(card: ProjectCard, actionsFolder: string): OpenTabKind {
    if (isPathInFolder(card.path, actionsFolder)) return 'action'
    if (typeof card.headerFields.id === 'string' || markdownParsingService.followsCardNamingConvention(card.path)) return 'card'

    return 'markdown'
}

function tabData(cardTypes: CardTypeConfig[], actionsFolder: string, document: OpenDocument): OpenTab | null {
    if (document.kind === 'action') {
        const action = document.getObject()
        if (!action.sourcePath) return null

        return { color: null, document, id: null, key: `action:${action.id}`, kind: 'action', label: action.label, title: action.label }
    }
    const card = document.getObject()
    const label = fileLabel(card)
    const id = label.startsWith(`${card.header.id} `) ? card.header.id : null

    return {
        color: cardTypeColor(card, cardTypes),
        document,
        id,
        key: `card:${card.header.internalId ?? card.path}`,
        kind: tabKind(card, actionsFolder),
        label,
        title: id ? label.slice(id.length + 1) : label,
    }
}

/** Horizontal bar of compact open-file tabs with card identity and close buttons. */
export function TabBar(props: TabBarProps) {
    const { actionsFolder, cardTypes } = props
    const { activeDocument, documents } = useOpenFiles()
    const tabs = documents
        .map((document) => tabData(cardTypes, actionsFolder, document))
        .filter((tab): tab is OpenTab => tab !== null)
    const invalidDocuments = documents.filter((document) => !tabData(cardTypes, actionsFolder, document))
    const invalidDocumentMessage = invalidDocuments.length > 0
        ? `${invalidDocuments.length} open document${invalidDocuments.length === 1 ? '' : 's'} could not be shown`
        : null
    const theme = useTheme()

    useEffect(() => {
        if (invalidDocumentMessage) dialogService.error(invalidDocumentMessage)
    }, [invalidDocumentMessage])

    const handleChange = (_event: SyntheticEvent, value: OpenDocument) => {
        openFilesService.activateDocument(value)
        telemetryService.trackEvent('navigation')
    }

    const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
        try {
            event.stopPropagation()
            const index = Number(event.currentTarget.dataset.index)
            const document = tabs[index]?.document
            if (!document) throw new Error('Missing document for tab close button')

            openFilesService.closeDocument(document)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Document tab could not be closed' })
        }
    }

    if (tabs.length === 0) return null

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
                        key={tab.key}
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
