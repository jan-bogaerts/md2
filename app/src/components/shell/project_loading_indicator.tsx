import { Box, CircularProgress, Stack, Typography } from '@mui/material';

/** Replaces project content while a project session is loading. */
export function ProjectLoadingIndicator() {
    return (
        <Box aria-label="Loading project" role="status" sx={{ alignItems: 'center', display: 'flex', flex: 1, justifyContent: 'center' }}>
            <Stack spacing={2} sx={{ alignItems: 'center' }}>
                <CircularProgress />
                <Typography color="text.secondary" variant="body1">Loading project...</Typography>
            </Stack>
        </Box>
    );
}
