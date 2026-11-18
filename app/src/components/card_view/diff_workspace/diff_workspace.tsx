import { Box } from '@mui/material';
import { useSyncExternalStore } from 'react';
import { DiffWorkspaceFileTab, type DiffWorkspaceSourceKind } from './diff_workspace_file_tab';
import { DiffWorkspaceFilesTab } from './diff_workspace_files_tab';
import type { DiffWorkspaceSearchService } from './diff_workspace_search_service';
import { DiffWorkspaceSearchRow } from './diff_workspace_search_row';
import type { DiffWorkspaceService } from './diff_workspace_service';
import { DiffWorkspaceTabs } from './diff_workspace_tabs';

interface DiffWorkspaceProps {
    search: DiffWorkspaceSearchService;
    sourceKind: DiffWorkspaceSourceKind;
    workspace: DiffWorkspaceService;
}

/** Tabbed diff body: search row, tab strip, and only the active tab's content. */
export function DiffWorkspace({ search, sourceKind, workspace }: DiffWorkspaceProps) {
    const activePath = useSyncExternalStore(workspace.subscribeActivePath, workspace.getActivePath, workspace.getActivePath);

    return (
        <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
            <DiffWorkspaceSearchRow service={search} />
            <DiffWorkspaceTabs workspace={workspace} />
            {activePath === null ? (
                <DiffWorkspaceFilesTab search={search} workspace={workspace} />
            ) : (
                <DiffWorkspaceFileTab key={activePath} path={activePath} search={search} sourceKind={sourceKind} workspace={workspace} />
            )}
        </Box>
    );
}
