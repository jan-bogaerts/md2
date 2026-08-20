import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { projectStatsService } from '../../services/stats/project_stats_service'
import { StatsView } from './stats_view'

const hookState = vi.hoisted(() => ({
    project: { branch: 'main', id: 'project' },
    snapshot: {
        activeCards: [{ header: { id: 'F_1', internalId: 'card-1', title: 'First' }, path: 'design/F_1.md' }],
        backgroundCards: [],
    },
    viewMode: 'stats',
}))

vi.mock('../hooks/use_project_state', () => ({useProjectState: () => ({ project: hookState.project, snapshot: hookState.snapshot })}))
vi.mock('../hooks/use_workspace_view', () => ({useWorkspaceView: () => ({ viewMode: hookState.viewMode })}))
vi.mock('./stats_content', () => ({ StatsContent: () => <div>Stats content</div> }))

describe('StatsView session lifecycle', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        hookState.viewMode = 'stats'
    })

    it('opens once across card snapshots and closes when Stats becomes hidden', () => {
        const open = vi.spyOn(projectStatsService, 'open').mockResolvedValue()
        const close = vi.spyOn(projectStatsService, 'close').mockImplementation(() => undefined)
        const { rerender } = render(<StatsView />)

        expect(open).toHaveBeenCalledTimes(1)
        hookState.snapshot = { ...hookState.snapshot, activeCards: [...hookState.snapshot.activeCards] }
        rerender(<StatsView />)
        expect(open).toHaveBeenCalledTimes(1)

        hookState.viewMode = 'cards'
        rerender(<StatsView />)
        expect(close).toHaveBeenCalledTimes(1)
    })
})
