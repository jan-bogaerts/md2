import { Box, Stack, Typography } from '@mui/material'
import CardsOutline from 'mdi-material-ui/CardsOutline'
import { useProjectState } from '../hooks/use_project_state'

/** Status-bar totals for all project cards and active cards. */
export function ProjectCardCountSummary() {
    const { snapshot } = useProjectState()
    const activeCardCount = snapshot?.activeCards.length ?? 0
    const totalCardCount = activeCardCount + (snapshot?.backgroundCards.length ?? 0)

    return (
        <>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <CardsOutline sx={{ color: 'text.secondary', fontSize: 14 }} />
                <Typography component="span" sx={{ color: 'text.primary', fontSize: 'inherit', fontWeight: 600 }}>
                    {totalCardCount}
                </Typography>
                <Box component="span">cards</Box>
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <Box sx={{ bgcolor: 'success.main', borderRadius: '50%', height: 7, width: 7 }} />
                <Typography component="span" sx={{ color: 'text.primary', fontSize: 'inherit', fontWeight: 600 }}>
                    {activeCardCount}
                </Typography>
                <Box component="span">active</Box>
            </Stack>
        </>
    )
}
