import { Box, IconButton, Tooltip } from '@mui/material'
import Fullscreen from 'mdi-material-ui/Fullscreen'
import FullscreenExit from 'mdi-material-ui/FullscreenExit'
import type { CardTypeConfig } from '../../data/data_types'
import { MarkdownFormatToolbarControls } from '../editor/markdown_format_toolbar_controls'
import { CardPropertiesControl } from '../text_view/card_properties_control'

interface CardPopupToolbarControlsProps {
    cardTypes: CardTypeConfig[]
    isFullscreen: boolean
    isMobile: boolean
    onToggleFullscreen: () => void
    statusColors: Map<string, string>
}

/** Formatting controls arranged for the card details popup. */
export function CardPopupToolbarControls(props: CardPopupToolbarControlsProps) {
    const { cardTypes, isFullscreen, isMobile, onToggleFullscreen, statusColors } = props
    const label = isFullscreen ? 'Exit fullscreen' : 'Fullscreen'

    return (
        <MarkdownFormatToolbarControls endControls={(
            <>
                <Box sx={{ flex: 1 }} />
                <CardPropertiesControl binding="board-card" cardTypes={cardTypes} statusColors={statusColors} />
                {!isMobile ? (
                    <Tooltip title={label}>
                        <IconButton aria-label={label} onClick={onToggleFullscreen} size="small" sx={{ height: 30, width: 30 }}>
                            {isFullscreen ? <FullscreenExit sx={{ fontSize: 17 }} /> : <Fullscreen sx={{ fontSize: 17 }} />}
                        </IconButton>
                    </Tooltip>
                ) : null}
            </>
        )} />
    )
}
