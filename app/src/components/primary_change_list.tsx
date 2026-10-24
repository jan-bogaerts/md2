import { Box } from '@mui/material';
import { usePrimaryChangesList } from './hooks/use_primary_changes';
import { PrimaryChangeRow } from './primary_change_row';

/** Lists every dirty primary worktree entry under review. */
export function PrimaryChangeList() {
    const changes = usePrimaryChangesList();

    return (
        <Box aria-label="Uncommitted files" component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {changes.map((change) => <PrimaryChangeRow change={change} key={change.path} />)}
        </Box>
    );
}
