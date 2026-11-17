import { Box, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { parseDiff, type FileData } from 'react-diff-view';
import 'react-diff-view/style/index.css';
import type { DiffResult, OpenInEditorRequest, WorktreeDiffResult } from '../../../../data/electron_action_bridge';
import { dialogService } from '../../../../services/dialog_service';
import {
    generateDiff as defaultGenerateDiff,
    openDiffLine as defaultOpenDiffLine,
    type DiffCommitReference,
} from '../../../../services/data/diff_service';
import { diffCommentService } from './diff_comment_service';
import { DiffFileView } from './diff_file_view';

type GenerateDiff = (commitReference: DiffCommitReference) => Promise<DiffResult>;
type OpenDiffLine = (request: OpenInEditorRequest) => Promise<void>;

interface DiffViewProps {
    commitReference?: DiffCommitReference;
    generateDiff?: GenerateDiff;
    initialPath?: string;
    label?: string;
    openDiffLine?: OpenDiffLine;
    result?: WorktreeDiffResult;
}

interface DiffLoadState {
    files: FileData[] | null;
    key: string;
    result: DiffResult | WorktreeDiffResult | null;
    unavailable: boolean;
}

function parsedFileMatchesPath(file: FileData, filePath: string) {
    return file.oldPath === filePath || file.newPath === filePath;
}

function parsedFilesWithNormalizedTypes(result: DiffResult | WorktreeDiffResult) {
    return parseDiff(result.patch).map((file, index) => {
        const changeType = result.files[index]?.changeType;
        if (!changeType) return file;
        const type = changeType === 'added' ? 'add' : changeType === 'deleted' ? 'delete' : changeType === 'renamed' ? 'rename' : 'modify';

        return { ...file, type };
    });
}

/** Loads and parses a unified patch, then composes independently rendered file diffs. */
export function DiffView(props: DiffViewProps) {
    const { commitReference, initialPath, label = 'Commit diff', result: providedResult } = props;
    const generateDiff = props.generateDiff ?? defaultGenerateDiff;
    const openDiffLine = props.openDiffLine ?? defaultOpenDiffLine;
    const requestKey = providedResult ? `worktree:${providedResult.revision}` : `commit:${commitReference?.commit ?? 'missing'}`;
    const [loadState, setLoadState] = useState<DiffLoadState>({ files: null, key: requestKey, result: null, unavailable: false });
    const initialFileRef = useRef<HTMLDivElement | null>(null);
    const currentLoadState = loadState.key === requestKey ? loadState : null;
    const result = currentLoadState?.result ?? null;
    const parsedFiles = currentLoadState?.files ?? null;
    const isUnavailable = currentLoadState?.unavailable ?? false;

    useEffect(() => {
        let isActive = true;

        async function loadDiff() {
            try {
                await Promise.resolve();
                if (!providedResult && !commitReference) throw new Error('Missing commit diff reference');
                const diff = providedResult ?? await generateDiff(commitReference!);
                const files = parsedFilesWithNormalizedTypes(diff);
                if (files.length === 0 || files.some((file) => !file.oldPath && !file.newPath)) {
                    throw new Error('Diff patch contains no parseable files');
                }
                if (!isActive) return;
                if ('revision' in diff) diffCommentService.activateWorktreeRevision(diff.revision);
                setLoadState({ files, key: requestKey, result: diff, unavailable: false });
            } catch (loadError) {
                if (!isActive) return;
                setLoadState({ files: null, key: requestKey, result: null, unavailable: true });
                dialogService.error(loadError, { fallbackMessage: 'Could not load diff' });
            }
        }

        void loadDiff();

        return () => {
            isActive = false;
        };
    }, [commitReference, generateDiff, providedResult, requestKey]);

    useEffect(() => {
        if (parsedFiles && initialPath) initialFileRef.current?.scrollIntoView({ block: 'start' });
    }, [initialPath, parsedFiles]);

    const handleOpenLine = async (request: OpenInEditorRequest) => {
        try {
            if (!result?.repositoryRoot) throw new Error('Diff result is missing execution repository root');
            await openDiffLine({ ...request, repositoryRoot: result.repositoryRoot });
        } catch (openError) {
            dialogService.error(openError, { fallbackMessage: 'Could not open local file' });
        }
    };

    if (isUnavailable) return <Typography color="text.secondary" variant="caption">Diff unavailable.</Typography>;
    if (!result || !parsedFiles) return <Typography color="text.secondary" variant="caption">Loading diff…</Typography>;

    const revision = 'commit' in result ? result.commit : result.revision;

    return (
        <Box aria-label={label} role="region">
            {parsedFiles.map((file, index) => (
                <DiffFileView
                    containerRef={initialPath && parsedFileMatchesPath(file, initialPath) ? initialFileRef : undefined}
                    file={file}
                    key={`${file.oldPath}:${file.newPath}:${index}`}
                    onOpenLine={handleOpenLine}
                    revision={revision}
                />
            ))}
        </Box>
    );
}
