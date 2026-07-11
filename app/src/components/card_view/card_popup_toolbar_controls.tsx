import { Box, IconButton, Tooltip } from '@mui/material'
import {
    BoldItalicUnderlineToggles, CreateLink, InsertCodeBlock, InsertImage, InsertTable,
    InsertThematicBreak, ListsToggle, Separator, UndoRedo,
} from '@mdxeditor/editor'
import Fullscreen from 'mdi-material-ui/Fullscreen'
import FullscreenExit from 'mdi-material-ui/FullscreenExit'

interface CardPopupToolbarControlsProps {
    isFullscreen: boolean
    onToggleFullscreen: () => void
}

/** Formatting controls arranged for the card details popup. */
export function CardPopupToolbarControls(props: CardPopupToolbarControlsProps) {
    const { isFullscreen, onToggleFullscreen } = props
    const label = isFullscreen ? 'Exit fullscreen' : 'Fullscreen'

    return (
        <>
            <UndoRedo />
            <Separator />
            <BoldItalicUnderlineToggles />
            <Separator />
            <ListsToggle />
            <CreateLink />
            <InsertImage />
            <InsertTable />
            <InsertThematicBreak />
            <InsertCodeBlock />
            <Box sx={{ flex: 1 }} />
            <Tooltip title={label}>
                <IconButton aria-label={label} onClick={onToggleFullscreen} size="small" sx={{ height: 30, width: 30 }}>
                    {isFullscreen ? <FullscreenExit sx={{ fontSize: 17 }} /> : <Fullscreen sx={{ fontSize: 17 }} />}
                </IconButton>
            </Tooltip>
        </>
    )
}
