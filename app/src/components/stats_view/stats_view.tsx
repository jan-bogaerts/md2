import { Box } from '@mui/material'
import { useEffect, useMemo, useRef } from 'react'
import { projectStatsService } from '../../services/stats/project_stats_service'
import type { StatsCardDescriptor } from '../../services/stats/project_stats_types'
import { useProjectState } from '../hooks/use_project_state'
import { useWorkspaceView } from '../hooks/use_workspace_view'
import { StatsContent } from './stats_content'

/** Lifetime-stable stats surface; repository reads begin only when stats mode becomes visible. */
export function StatsView() {
    const { project, snapshot } = useProjectState()
    const { viewMode } = useWorkspaceView()
    const cards = useMemo(() => {
        const projectCards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]

        return projectCards.flatMap((card): StatsCardDescriptor[] => card.header.internalId ? [{
            internalId: card.header.internalId,
            path: card.path,
            title: card.header.title,
            visibleId: card.header.id,
        }] : [])
    }, [snapshot])
    const cardsRef = useRef(cards)

    useEffect(() => {
        cardsRef.current = cards
    }, [cards])

    useEffect(() => {
        if (viewMode !== 'stats' || !project) return

        void projectStatsService.open(cardsRef.current)

        return () => projectStatsService.close()
    }, [project, viewMode])

    return (
        <Box
            aria-label="Stats view"
            sx={{ bgcolor: 'background.default', display: viewMode === 'stats' ? 'flex' : 'none', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
            <StatsContent />
        </Box>
    )
}
