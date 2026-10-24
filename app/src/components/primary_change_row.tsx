import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import type { PrimaryChange } from '../data/primary_change_types';
import { primaryChangesService } from '../services/project/primary_changes_service';
import { dialogService } from '../services/dialog_service';
import { usePrimaryChangesBusy } from './hooks/use_primary_changes';

interface PrimaryChangeRowProps {
    change: PrimaryChange;
}

const STATE_DOT_SIZE = 8;

/** Dot color and tooltip that tell whether an entry is tracked by Git and how it changed. */
function trackedIndicator({ kind, tracked }: PrimaryChange) {
    if (!tracked) return { color: 'info.main', label: 'Untracked: not yet in Git' };
    if (kind === 'deleted') return { color: 'error.main', label: 'Tracked: deleted' };

    return { color: 'warning.main', label: `Tracked: ${kind}` };
}

/** One dirty primary worktree entry with its tracked state and an optional trash action. */
export function PrimaryChangeRow({ change }: PrimaryChangeRowProps) {
    const busy = usePrimaryChangesBusy();
    const { color, label } = trackedIndicator(change);
    const displayPath = change.originalPath ? `${change.originalPath} → ${change.path}` : change.path;
    const trashLabel = `Move ${change.path} to trash`;

    const handleTrash = async () => {
        try {
            await primaryChangesService.trash(change.path);
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Could not move ${change.path} to the trash` });
        }
    };

    return (
        <Box
            component="li"
            sx={{
                alignItems: 'center',
                borderRadius: 1,
                display: 'flex',
                gap: 1,
                minHeight: 34,
                minWidth: 0,
                px: 1,
                '&:hover': { bgcolor: 'custom.track' },
                '&:focus-within .primary-change-actions, &:hover .primary-change-actions': { opacity: 1 },
            }}
        >
            <Tooltip title={label}>
                <Box
                    aria-label={label}
                    component="span"
                    role="img"
                    sx={{ bgcolor: color, borderRadius: '50%', flexShrink: 0, height: STATE_DOT_SIZE, width: STATE_DOT_SIZE }}
                />
            </Tooltip>
            <Typography sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }} variant="body2">{displayPath}</Typography>
            {change.onDisk ? (
                <Tooltip title={trashLabel}>
                    <Box className="primary-change-actions" component="span" sx={{ opacity: 0 }}>
                        <IconButton aria-label={trashLabel} disabled={busy} onClick={handleTrash} size="small">
                            <DeleteOutlined sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Box>
                </Tooltip>
            ) : null}
        </Box>
    );
}
