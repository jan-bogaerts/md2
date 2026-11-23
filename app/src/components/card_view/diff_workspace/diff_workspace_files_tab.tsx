import { Box, Button, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useSyncExternalStore, type MouseEvent } from 'react';
import type { DiffWorkspaceSearchService } from './diff_workspace_search_service';
import type { DiffWorkspaceService } from './diff_workspace_service';
import type { DiffWorkspaceEntry } from './diff_workspace_types';

interface DiffWorkspaceFilesTabProps {
    search: DiffWorkspaceSearchService;
    workspace: DiffWorkspaceService;
}

const FILE_LINK_SELECTOR = '[data-path]';

function entryLabel(entry: DiffWorkspaceEntry) {
    return entry.changeType === 'renamed' && entry.oldPath ? `${entry.oldPath} -> ${entry.path}` : entry.path;
}

/** Lists every changed file by full repository path; selecting one opens or activates its tab. */
export function DiffWorkspaceFilesTab({ search, workspace }: DiffWorkspaceFilesTabProps) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const manifest = useSyncExternalStore(workspace.subscribeManifest, workspace.getManifest, workspace.getManifest);

    useEffect(() => {
        if (!viewportRef.current) return undefined;

        return search.registerViewport(viewportRef.current, 'files', FILE_LINK_SELECTOR);
    }, [search]);

    const handleOpenFile = (event: MouseEvent<HTMLButtonElement>) => {
        const { path } = event.currentTarget.dataset;
        if (path) workspace.openFile(path);
    };

    return (
        <Box ref={viewportRef} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5 }}>
            {manifest.status === 'loading' ? <Typography>Loading changed files…</Typography> : null}
            {manifest.status === 'error' ? <Typography color="error" role="alert">{manifest.error.message}</Typography> : null}
            {manifest.status === 'ready' && manifest.entries.length === 0 ? (
                <Typography color="text.secondary">No changed files</Typography>
            ) : null}
            {manifest.status === 'ready' && manifest.entries.length > 0 ? (
                <Stack aria-label="Changed files" component="nav" spacing={0.5}>
                    {manifest.entries.map((entry) => (
                        <Button
                            data-path={entry.path}
                            key={entry.path}
                            onClick={handleOpenFile}
                            sx={{ fontFamily: 'monospace', justifyContent: 'flex-start', overflowWrap: 'anywhere', textAlign: 'left', textTransform: 'none' }}
                            variant="text"
                        >
                            {entryLabel(entry)}
                        </Button>
                    ))}
                </Stack>
            ) : null}
        </Box>
    );
}
