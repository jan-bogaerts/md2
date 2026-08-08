import TuneOutlined from '@mui/icons-material/TuneOutlined'
import { IconButton, Tooltip } from '@mui/material'
import { useCallback, useState, type MouseEvent } from 'react'
import type { CardTypeConfig } from '../../data/data_types'
import { dialogService } from '../../services/dialog_service'
import { cardMarkdownDataSource, type CardBinding, type CardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { useActiveCard } from '../hooks/use_active_card'
import { CardPropertiesPanel } from './card_properties_panel'
import { CardPropertiesPopover } from './card_properties_popover'

interface CardPropertiesControlProps {
    binding: CardBinding
    cardTypes: CardTypeConfig[]
    dataSource?: CardMarkdownDataSource
    statusColors: Map<string, string>
}

interface PropertiesAnchor {
    documentId: string
    element: HTMLElement
}

/** Icon-only Properties control shared by list and board card toolbars. */
export function CardPropertiesControl(props: CardPropertiesControlProps) {
    const { binding, cardTypes, dataSource = cardMarkdownDataSource, statusColors } = props
    const card = useActiveCard(binding, dataSource)
    const documentId = card?.header.internalId ?? null
    const [propertiesAnchor, setPropertiesAnchor] = useState<PropertiesAnchor | null>(null)
    const isOpen = !!documentId && propertiesAnchor?.documentId === documentId

    const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
        try {
            const activeDocumentId = dataSource.getActiveDocument(binding)?.getObject().header.internalId
            if (!activeDocumentId) throw new Error(`Cannot open card properties without an active ${binding} document`)

            setPropertiesAnchor({ documentId: activeDocumentId, element: event.currentTarget })
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Card properties could not be opened' })
        }
    }, [binding, dataSource])
    const handleClose = useCallback(() => setPropertiesAnchor(null), [])

    if (!card || !documentId || !card.hasFrontmatter) return null

    return (
        <>
            <Tooltip title="Properties">
                <IconButton
                    aria-haspopup="dialog"
                    aria-label="Properties"
                    onClick={handleOpen}
                    size="small"
                    sx={{
                        bgcolor: isOpen ? 'custom.primaryBg' : 'transparent',
                        color: isOpen ? 'primary.main' : 'inherit',
                        height: 30,
                        width: 30,
                        '&:hover': { bgcolor: 'custom.track', color: 'primary.main' },
                    }}
                >
                    <TuneOutlined sx={{ fontSize: 17 }} />
                </IconButton>
            </Tooltip>
            <CardPropertiesPopover
                anchorElement={isOpen ? propertiesAnchor.element : null}
                onClose={handleClose}
                open={isOpen}
            >
                <CardPropertiesPanel
                    binding={binding}
                    cardTypes={cardTypes}
                    dataSource={dataSource}
                    statusColors={statusColors}
                />
            </CardPropertiesPopover>
        </>
    )
}
