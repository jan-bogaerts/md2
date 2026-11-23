import { Tab, Tabs, Tooltip } from '@mui/material';
import { useSyncExternalStore, type SyntheticEvent } from 'react';
import type { DiffWorkspaceService } from './diff_workspace_service';

interface DiffWorkspaceTabsProps {
    workspace: DiffWorkspaceService;
}

const FILES_TAB_INDEX = 0;

function fileName(path: string) {
    return path.split('/').at(-1) ?? path;
}

/** Fixed `Files` tab followed by horizontally scrolling file tabs labelled with the filename only. */
export function DiffWorkspaceTabs({ workspace }: DiffWorkspaceTabsProps) {
    const openPaths = useSyncExternalStore(workspace.subscribeOpenPaths, workspace.getOpenPaths, workspace.getOpenPaths);
    const activePath = useSyncExternalStore(workspace.subscribeActivePath, workspace.getActivePath, workspace.getActivePath);
    const activeIndex = activePath === null ? FILES_TAB_INDEX : openPaths.indexOf(activePath) + 1;

    const handleChange = (_event: SyntheticEvent, index: number) => {
        if (index === FILES_TAB_INDEX) {
            workspace.showFiles();
            return;
        }
        const path = openPaths[index - 1];
        if (path) workspace.openFile(path);
    };

    return (
        <Tabs
            aria-label="Changed file tabs"
            onChange={handleChange}
            scrollButtons="auto"
            sx={{
                borderBottom: 1,
                borderColor: 'divider',
                flexShrink: 0,
                minHeight: 40,
                '& .MuiTabs-indicator': { height: 2 },
                '& .MuiTab-root': { color: 'text.secondary', minHeight: 40, py: 0, textTransform: 'none' },
                '& .MuiTab-root.Mui-selected': { color: 'primary.main' },
            }}
            value={activeIndex}
            variant="scrollable"
        >
            <Tab label="Files" value={FILES_TAB_INDEX} />
            {openPaths.map((path, index) => (
                <Tab
                    aria-label={path}
                    key={path}
                    label={<Tooltip title={path}><span>{fileName(path)}</span></Tooltip>}
                    value={index + 1}
                />
            ))}
        </Tabs>
    );
}
