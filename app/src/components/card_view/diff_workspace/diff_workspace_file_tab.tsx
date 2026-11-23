import { Box, Typography } from '@mui/material';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { DiffView } from '../../actions/conversation/events/diff_view';
import { MarkdownEditor } from '../../editor/markdown_editor';
import type { DiffWorkspaceSearchService } from './diff_workspace_search_service';
import type { DiffWorkspaceService } from './diff_workspace_service';

export type DiffWorkspaceSourceKind = 'commit' | 'worktree';

interface DiffWorkspaceFileTabProps {
    path: string;
    search: DiffWorkspaceSearchService;
    sourceKind: DiffWorkspaceSourceKind;
    workspace: DiffWorkspaceService;
}

const PATCH_TEXT_SELECTOR = '.diff-code';

function ignoreReadOnlyChange() {
    // Diff editor is read-only and intentionally disconnected from persistence.
}

/** Active file tab: renders only this path's lazily loaded result and its file-scoped states. */
export function DiffWorkspaceFileTab({ path, search, sourceKind, workspace }: DiffWorkspaceFileTabProps) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const subscribeFile = useCallback((listener: () => void) => workspace.subscribeFile(path)(listener), [path, workspace]);
    const getFileState = useCallback(() => workspace.getFileState(path), [path, workspace]);
    const fileState = useSyncExternalStore(subscribeFile, getFileState, getFileState);
    const contentKind = fileState.status === 'ready' ? fileState.content.kind : null;

    useEffect(() => {
        if (!viewportRef.current) return undefined;

        return search.registerViewport(viewportRef.current, 'file', contentKind === 'patch' ? PATCH_TEXT_SELECTOR : undefined);
    }, [contentKind, search]);

    return (
        <Box aria-label={`Diff of ${path}`} ref={viewportRef} role="tabpanel" sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0, overflowY: 'auto' }}>
            {fileState.status === 'loading' ? <Typography sx={{ p: 2 }}>Loading diff…</Typography> : null}
            {fileState.status === 'error' ? <Typography color="error" role="alert" sx={{ p: 2 }}>{fileState.error.message}</Typography> : null}
            {fileState.status === 'empty' ? <Typography color="text.secondary" sx={{ p: 2 }}>No changes in this file</Typography> : null}
            {fileState.status === 'ready' && fileState.content.kind === 'markdown' ? (
                fileState.content.bodyDiff.oldBody === fileState.content.bodyDiff.newBody ? (
                    <Typography color="text.secondary" sx={{ p: 2 }}>No body changes in this {sourceKind}</Typography>
                ) : (
                    <MarkdownEditor
                        diffMarkdown={fileState.content.bodyDiff.oldBody}
                        hideToolbar
                        localTextSearch={false}
                        markdown={fileState.content.bodyDiff.newBody}
                        onChange={ignoreReadOnlyChange}
                        readOnly
                        viewMode="diff"
                    />
                )
            ) : null}
            {fileState.status === 'ready' && fileState.content.kind === 'patch' ? (
                <Box sx={{ p: 1.5 }}>
                    <DiffView label={`Diff ${path}`} result={fileState.content.result} />
                </Box>
            ) : null}
        </Box>
    );
}
