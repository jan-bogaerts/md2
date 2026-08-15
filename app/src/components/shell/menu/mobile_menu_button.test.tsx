import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodexRateLimitSnapshot } from '../../../data/electron_codex_runtime_bridge'
import { AppThemeProvider } from '../../../theme/theme_provider'
import { MobileMenuButton } from './mobile_menu_button'

const state = vi.hoisted(() => ({
    codex: { receivedAt: null as number | null, snapshot: null as CodexRateLimitSnapshot | null, stale: false },
    persistence: { hasPendingPush: false, hasPendingSave: false, localSaveState: 'saved' },
    remote: { active: false, clientCount: 0, endpoint: null },
    session: { isPushing: false },
}))

vi.mock('../../hooks/use_codex_rate_limits', () => ({ useCodexRateLimits: () => state.codex }))
vi.mock('../../hooks/use_project_persistence', () => ({ useProjectPersistence: () => state.persistence }))
vi.mock('../../hooks/use_project_session', () => ({ useProjectSession: () => state.session }))
vi.mock('../use_remote_control_status', () => ({useRemoteControlStatus: () => ({ bridge: null, setStatus: vi.fn(), status: state.remote })}))

function renderButton(onOpenMenu = vi.fn()) {
    return render(
        <AppThemeProvider>
            <MobileMenuButton onOpenMenu={onOpenMenu} />
        </AppThemeProvider>,
    )
}

function setCodexUsage(usedPercent: number) {
    state.codex = {
        receivedAt: Date.now(),
        snapshot: {
            available: true,
            buckets: [{
                credits: null,
                individualLimit: null,
                limitId: 'Codex',
                limitName: 'Codex',
                planType: 'plus',
                primary: { resetsAt: Date.now() + 60_000, usedPercent, windowDurationMins: 300 },
                rateLimitReachedType: null,
                secondary: null,
            }],
            observedAt: Date.now(),
            rateLimitResetCredits: null,
        },
        stale: false,
    }
}

describe('MobileMenuButton', () => {
    afterEach(() => {
        cleanup()
        state.codex = { receivedAt: null, snapshot: null, stale: false }
        state.persistence = { hasPendingPush: false, hasPendingSave: false, localSaveState: 'saved' }
        state.remote = { active: false, clientCount: 0, endpoint: null }
        state.session = { isPushing: false }
    })

    it('keeps its accessible name and click behavior when attention is shown', () => {
        state.persistence = { hasPendingPush: false, hasPendingSave: true, localSaveState: 'dirty' }
        const onOpenMenu = vi.fn()
        renderButton(onOpenMenu)

        const button = screen.getByRole('button', { name: 'Open menu' })
        button.focus()
        fireEvent.click(button)

        expect(button).toHaveFocus()
        expect(onOpenMenu).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('mobile-menu-attention')).toBeInTheDocument()
    })

    it.each([
        ['pending push', () => { state.persistence.hasPendingPush = true }],
        ['active push', () => { state.session.isPushing = true }],
        ['near Codex limit', () => setCodexUsage(80)],
        ['reached Codex limit', () => setCodexUsage(100)],
        ['active remote control', () => { state.remote.active = true }],
    ])('shows attention for %s', (_name, configure) => {
        configure()
        renderButton()

        expect(screen.getByTestId('mobile-menu-attention')).toBeInTheDocument()
    })

    it('clears attention when no warning state remains', () => {
        renderButton()

        expect(screen.queryByTestId('mobile-menu-attention')).toBeNull()
    })
})
