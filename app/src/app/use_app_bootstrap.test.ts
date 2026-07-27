import { act, renderHook } from '@testing-library/react'
import { createElement, StrictMode, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
    ApplicationStartupService,
    type ApplicationStartupDependencies,
} from '../services/application_startup_service'
import { useAppBootstrap } from './use_app_bootstrap'

function StrictModeWrapper(props: { children: ReactNode }) {
    const { children } = props

    return createElement(StrictMode, null, children)
}

function createDependencies(overrides: Partial<ApplicationStartupDependencies> = {}): ApplicationStartupDependencies {
    return {
        getGithubAccessToken: vi.fn(() => null),
        initializeAgentCapabilities: vi.fn(async () => {}),
        initializeServices: vi.fn(),
        restoreGithubSession: vi.fn(async () => {}),
        restoreLastProject: vi.fn(async () => {}),
        ...overrides,
    }
}

describe('useAppBootstrap', () => {
    it('observes one service-owned startup under StrictMode', async () => {
        const dependencies = createDependencies()
        const service = new ApplicationStartupService(dependencies)
        const { result } = renderHook(() => useAppBootstrap(service), { wrapper: StrictModeWrapper })

        await act(async () => {
            await Promise.all([service.start(), service.start()])
        })

        expect(result.current).toEqual({ error: null, phase: 'ready' })
        expect(dependencies.initializeServices).toHaveBeenCalledOnce()
        expect(dependencies.restoreGithubSession).toHaveBeenCalledOnce()
        expect(dependencies.initializeAgentCapabilities).toHaveBeenCalledOnce()
        expect(dependencies.restoreLastProject).toHaveBeenCalledOnce()
    })

    it('passes restored GitHub token into last-project restoration', async () => {
        const dependencies = createDependencies({getGithubAccessToken: vi.fn(() => 'token-1')})
        const service = new ApplicationStartupService(dependencies)

        await service.start()

        expect(dependencies.restoreLastProject).toHaveBeenCalledWith('token-1')
    })

    it('publishes startup failures and still settles startup', async () => {
        const dependencies = createDependencies({
            restoreLastProject: vi.fn(async () => {
                throw new Error('Stored project is unavailable')
            }),
        })
        const service = new ApplicationStartupService(dependencies)

        await service.start()

        expect(service.getSnapshot()).toEqual({ error: 'Stored project is unavailable', phase: 'ready' })
    })
})
