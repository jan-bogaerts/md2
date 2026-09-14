import PanToolOutlined from '@mui/icons-material/PanToolOutlined';
import TouchAppOutlined from '@mui/icons-material/TouchAppOutlined';
import { useCallback, useSyncExternalStore } from 'react';
import {
    diagramEditSessionService,
    type DiagramEditSessionService,
    type DiagramPersistentTool,
} from '../../services/diagrams/diagram_edit_session_service';
import { MenuIconButton } from '../shell/menu/menu_icon_button';

const TOOL_ICON = {
    pan: <PanToolOutlined fontSize="small" />,
    select: <TouchAppOutlined fontSize="small" />,
};

/** Select or Pan action subscribed only to active tool. */
export function DiagramMenuToolButton({ session = diagramEditSessionService, tool }: {
    session?: Pick<DiagramEditSessionService, 'getActiveToolSnapshot' | 'setActiveTool' | 'subscribeActiveTool'>;
    tool: Extract<DiagramPersistentTool, 'pan' | 'select'>;
}) {
    const activeTool = useSyncExternalStore(
        session.subscribeActiveTool,
        session.getActiveToolSnapshot,
        session.getActiveToolSnapshot,
    );
    const handleClick = useCallback(() => session.setActiveTool(tool), [session, tool]);
    const label = tool === 'select' ? 'Select' : 'Pan';

    return (
        <MenuIconButton label={label} onClick={handleClick} pressed={activeTool === tool} tooltip={`${label} diagram objects`}>
            {TOOL_ICON[tool]}
        </MenuIconButton>
    );
}
