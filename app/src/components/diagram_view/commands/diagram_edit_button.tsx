import EditOutlined from '@mui/icons-material/EditOutlined';
import { useCallback, useSyncExternalStore } from 'react';
import { dialogService } from '../../../services/dialog_service';
import type { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service';
import type { DiagramViewService } from '../../../services/diagrams/diagram_view_service';
import { MenuIconButton } from '../../shell/menu/menu_icon_button';
import { DIAGRAM_EDITOR_ROOT_ATTRIBUTE } from '../editing/use_diagram_delete_key';

/** Starts editing only while current diagram source exists. */
export function DiagramEditButton({ session, viewService }: {
    session: DiagramEditSessionService;
    viewService: DiagramViewService;
}) {
    const source = useSyncExternalStore(
        viewService.subscribeSource,
        viewService.getSourceSnapshot,
        viewService.getSourceSnapshot,
    );
    const handleStartEditing = useCallback(() => {
        try {
            session.start();
            queueMicrotask(() => document.querySelector<HTMLElement>(`[${DIAGRAM_EDITOR_ROOT_ATTRIBUTE}]`)?.focus());
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Diagram editing could not be started' });
        }
    }, [session]);

    if (!source) return null;

    return (
        <MenuIconButton label="Edit diagram" onClick={handleStartEditing}>
            <EditOutlined fontSize="small" />
        </MenuIconButton>
    );
}
