import ArrowDropDownOutlined from '@mui/icons-material/ArrowDropDownOutlined';
import { IconButton, Tooltip } from '@mui/material';
import type { MouseEvent } from 'react';
import { useSyncExternalStore } from 'react';
import type { DiagramViewService } from '../../../services/diagrams/diagram_view_service';

export type DiagramRootMenuService = Pick<DiagramViewService, 'getRootMenuSnapshot' | 'openRootMenu' | 'subscribeRootMenu'>;

/** Dropdown icon that opens the saved-root menu from inside the root title editor. */
export function DiagramRootMenuDropdownButton({ service }: { service: DiagramRootMenuService }) {
    const rootMenu = useSyncExternalStore(service.subscribeRootMenu, service.getRootMenuSnapshot, service.getRootMenuSnapshot);
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => service.openRootMenu(event.currentTarget);
    const handleMouseDown = (event: MouseEvent<HTMLButtonElement>) => event.preventDefault();

    return (
        <Tooltip title="Open root diagrams">
            <IconButton
                aria-expanded={!!rootMenu}
                aria-haspopup="menu"
                aria-label="Open root diagrams"
                edge="end"
                onClick={handleClick}
                onMouseDown={handleMouseDown}
                size="small"
            >
                <ArrowDropDownOutlined fontSize="small" />
            </IconButton>
        </Tooltip>
    );
}
