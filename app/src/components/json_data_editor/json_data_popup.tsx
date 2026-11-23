import { Box, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import Close from 'mdi-material-ui/Close';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
    cardPopupService,
    subscribeCardPopupFocusRequest,
    subscribeCardPopups,
    type JsonDataPopupEntry,
} from '../../services/card_popup_service';
import { useWorkspaceView } from '../hooks/use_workspace_view';
import { ResizablePopper } from '../resizable_popper';
import { JsonDataEditor } from './json_data_editor';
import { openFilesService } from '../../services/open_files_service';

const JSON_POPUP_WIDTH = 760;
const JSON_POPUP_HEIGHT = 620;
const JSON_POPUP_SIZE_KEY = 'md2.jsonDataPopup.size';
const JSON_POPUP_PAPER_SX = {
    backgroundColor: 'background.paper',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: '14px',
    boxShadow: '0 24px 60px rgba(16, 24, 40, 0.28)',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
} as const;

interface JsonDataPopupEntryProps {
    entry: JsonDataPopupEntry;
    stackPosition: number;
    visible: boolean;
}

function JsonDataPopupEntryView({ entry, stackPosition, visible }: JsonDataPopupEntryProps) {
    const anchorElement = entry.anchorElement.isConnected ? entry.anchorElement : entry.fallbackAnchorElement;
    const titleId = `${entry.id}-title`;
    const handleClose = useCallback(() => cardPopupService.close(entry.id), [entry.id]);
    const handleActivate = useCallback(() => cardPopupService.activate(entry.id), [entry.id]);
    const subscribeFocusRequest = useCallback(
        (listener: () => void) => subscribeCardPopupFocusRequest(entry.id, listener),
        [entry.id],
    );
    useEffect(() => () => openFilesService.closeJsonPopupDocument(entry.document), [entry.document]);

    return (
        <ResizablePopper
            anchorElement={anchorElement}
            constrainSizeToViewport
            draggable
            initialSize={{ height: JSON_POPUP_HEIGHT, width: JSON_POPUP_WIDTH }}
            labelId={titleId}
            onActivate={handleActivate}
            onClose={handleClose}
            open={visible}
            paperSx={JSON_POPUP_PAPER_SX}
            resizeLabel="Resize JSON data popup"
            stackPosition={stackPosition}
            storageKey={JSON_POPUP_SIZE_KEY}
            subscribeFocusRequest={subscribeFocusRequest}
        >
            <Box
                data-drag-handle="true"
                sx={{ alignItems: 'center', borderBottom: 1, borderColor: 'divider', cursor: 'move', display: 'flex', flexShrink: 0, gap: '10px', padding: '12px 16px 12px 20px' }}
            >
                <Typography color="text.primary" id={titleId} noWrap sx={{ flex: 1, fontSize: 16, fontWeight: 700, minWidth: 0 }}>{entry.document.path}</Typography>
                <Tooltip title="Close">
                    <IconButton aria-label={`Close ${entry.document.path}`} onClick={handleClose} size="small" sx={{ height: 30, width: 30 }}>
                        <Close sx={{ fontSize: 17 }} />
                    </IconButton>
                </Tooltip>
            </Box>
            <JsonDataEditor document={entry.document} />
        </ResizablePopper>
    );
}

/** Renders managed JSON popup entries only while card workspace is visible. */
export function JsonDataPopup() {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { viewMode } = useWorkspaceView();
    const entries = useSyncExternalStore(subscribeCardPopups, cardPopupService.getSnapshot.bind(cardPopupService));
    const topEntryId = entries.at(-1)?.id;

    return entries.map((entry, stackPosition) => entry.kind === 'json-data' ? (
        <JsonDataPopupEntryView
            entry={entry}
            key={entry.id}
            stackPosition={stackPosition}
            visible={viewMode === 'cards' && (!isMobile || entry.id === topEntryId)}
        />
    ) : null);
}
