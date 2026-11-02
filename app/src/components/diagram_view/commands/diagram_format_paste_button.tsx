import FormatPaintOutlined from '@mui/icons-material/FormatPaintOutlined';
import { useCallback, useSyncExternalStore } from 'react';
import {
    diagramFormatPasteService,
    type DiagramFormatPasteService,
} from '../../../services/diagrams/diagram_format_paste_service';
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
} from '../../../services/diagrams/diagram_edit_session_service';
import {
    diagramSelectionService,
    type DiagramSelectionService,
} from '../../../services/diagrams/diagram_selection_service';
import { DiagramToolboxActionButton } from '../creation_tools/diagram_toolbox_action_button';

interface DiagramFormatPasteButtonProps {
    formatPaste?: Pick<DiagramFormatPasteService, 'getSourceSnapshot' | 'openDialog' | 'subscribeSource'>;
    selection?: Pick<DiagramSelectionService, 'getSelectionSnapshot' | 'subscribeSelection'>;
    session?: Pick<DiagramEditSessionService, 'read'>;
}

/** Opens Format Paste only when current selection contains a compatible target. */
export function DiagramFormatPasteButton({
    formatPaste = diagramFormatPasteService,
    selection = diagramSelectionService,
    session = diagramEditSessionService,
}: DiagramFormatPasteButtonProps) {
    const source = useSyncExternalStore(
        formatPaste.subscribeSource,
        formatPaste.getSourceSnapshot,
        formatPaste.getSourceSnapshot,
    );
    const selectedObjects = useSyncExternalStore(
        selection.subscribeSelection,
        selection.getSelectionSnapshot,
        selection.getSelectionSnapshot,
    );
    const editSession = useSyncExternalStore(
        session.read.subscribeSession,
        session.read.getSessionSnapshot,
        session.read.getSessionSnapshot,
    );
    const compatibleTargetSelected = !!source
        && selectedObjects.some(({ objectKind }) => objectKind === source.objectKind);
    const handleOpen = useCallback(() => { formatPaste.openDialog(); }, [formatPaste]);

    return (
        <DiagramToolboxActionButton
            disabled={!editSession || !compatibleTargetSelected}
            label="Format Paste"
            onActivate={handleOpen}
            tooltip="Apply copied diagram formatting"
        ><FormatPaintOutlined fontSize="small" /></DiagramToolboxActionButton>
    );
}
