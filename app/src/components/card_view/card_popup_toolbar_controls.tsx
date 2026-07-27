import { Box, IconButton, Tooltip } from '@mui/material'
import Fullscreen from 'mdi-material-ui/Fullscreen'
import FullscreenExit from 'mdi-material-ui/FullscreenExit'
import { MarkdownFormatToolbarControls } from '../editor/markdown_format_toolbar_controls'

interface CardPopupToolbarControlsProps {
    isFullscreen: boolean
    isMobile: boolean
    onToggleFullscreen: () => void
}

/** Formatting controls arranged for the card details popup. */
export function CardPopupToolbarControls(props: CardPopupToolbarControlsProps) {
    const { isFullscreen, isMobile, onToggleFullscreen } = props
    const label = isFullscreen ? 'Exit fullscreen' : 'Fullscreen'

    return (
        <MarkdownFormatToolbarControls endControls={!isMobile ? (
            <>
                <Box sx={{ flex: 1 }} />
                <Tooltip title={label}>
                    <IconButton aria-label={label} onClick={onToggleFullscreen} size="small" sx={{ height: 30, width: 30 }}>
                        {isFullscreen ? <FullscreenExit sx={{ fontSize: 17 }} /> : <Fullscreen sx={{ fontSize: 17 }} />}
                    </IconButton>
                </Tooltip>
            </>
        ) : null} />
    )
}
