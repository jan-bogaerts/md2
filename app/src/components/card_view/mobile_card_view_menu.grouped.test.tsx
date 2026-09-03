import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card } from '../../data/data_types'
import { dataService } from '../../services/data/data_service'
import { mobileCardViewService } from '../../services/project/mobile_card_view_service'
import { AppThemeProvider } from '../../theme/theme_provider'
import { MobileCardViewMenu } from './mobile_card_view_menu'

function card(id: string, status: string): Card {
    return {
        agentConversationErrors: [],
        agentConversations: [],
        content: '',
        header: {
            affects: [], after: null, agentLogReferences: [], changedFiles: [], author: null, id, internalId: id, owner: null,
            policy: {}, references: [], status, title: id,
        },
        hasFrontmatter:true,
        isActive: true,
        path: `design/${id}.md`,
    }
}

describe('MobileCardViewMenu', () => {
    beforeEach(() => {
        vi.spyOn(dataService, 'getState').mockReturnValue({
            project: { branch: 'main', id: 'project', rootPath: 'C:\\project' },
            runningAgents: [],
            snapshot: { activeCards: [card('F-1', 'todo'), card('F-2', 'done')], backgroundCards: [], repositoryFiles: [], workingFolder: 'design' },
        })
        mobileCardViewService.selectVisibleColumn([])
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('lists visible columns, selects one, and closes drawer', () => {
        const onSelected = vi.fn()
        render(
            <AppThemeProvider>
                <MobileCardViewMenu
                    onSelected={onSelected}
                    states={[
                        { alwaysVisible: false, state: 'todo' },
                        { alwaysVisible: false, state: 'done' },
                        { alwaysVisible: false, state: 'hidden' },
                    ]}
                />
            </AppThemeProvider>,
        )

        expect(screen.getByRole('menuitem', { name: 'todo' })).toHaveClass('Mui-selected')
        expect(screen.queryByRole('menuitem', { name: 'hidden' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('menuitem', { name: 'done' }))

        expect(mobileCardViewService.getSnapshot().selectedColumnStatus).toBe('done')
        expect(onSelected).toHaveBeenCalledOnce()
        act(() => mobileCardViewService.selectVisibleColumn([]))
    })
})
