import SearchOutlined from '@mui/icons-material/SearchOutlined';
import { IconButton, Tooltip } from '@mui/material';
import { useSyncExternalStore } from 'react';
import type { DiffWorkspaceSearchService } from './diff_workspace_search_service';

interface DiffWorkspaceSearchButtonProps {
    service: DiffWorkspaceSearchService;
}

/** Opens search for the active diff-workspace tab. */
export function DiffWorkspaceSearchButton({ service }: DiffWorkspaceSearchButtonProps) {
    const viewportMounted = useSyncExternalStore(service.subscribeViewportMounted, service.getViewportMounted, service.getViewportMounted);

    const handleOpen = () => {
        service.openSearch();
    };

    return (
        <Tooltip title="Find in diff">
            <span>
                <IconButton
                    aria-label="Find in diff"
                    disabled={!viewportMounted}
                    onClick={handleOpen}
                    size="small"
                    sx={{ flexShrink: 0, height: 30, width: 30 }}
                >
                    <SearchOutlined sx={{ fontSize: 18 }} />
                </IconButton>
            </span>
        </Tooltip>
    );
}
