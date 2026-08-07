import { describe, expect, it, vi } from 'vitest'
import type { ProjectReference } from '../../data/data_types'
import {
    ActionRunSettingsService,
    ActionRunSettingsStore,
    type ResolvedActionRunSettings,
} from './action_run_settings_service'

const firstSettings: ResolvedActionRunSettings = {accessLevel: 'workspace-write', agent: 'codex', approvalPolicy: 'on-request', model: 'gpt-5.5', thinkingLevel: 'high'}
const secondSettings: ResolvedActionRunSettings = {accessLevel: 'read-only', agent: 'claude', approvalPolicy: '', model: 'sonnet', thinkingLevel: 'none'}

function deferredVoid() {
    let rejectPromise: (error: unknown) => void = () => undefined
    let resolvePromise: () => void = () => undefined
    const promise = new Promise<void>((resolve, reject) => {
        rejectPromise = reject
        resolvePromise = resolve
    })

    return { promise, reject: rejectPromise, resolve: resolvePromise }
}

class ProjectStateOwner extends EventTarget {
    project: ProjectReference | null = { branch: 'main', id: 'first' }

    getState() {
        return { project: this.project }
    }

    setProject(project: ProjectReference | null) {
        this.project = project
        this.dispatchEvent(new Event('changed'))
    }
}

describe('ActionRunSettingsStore', () => {
    it('loads saved settings and publishes only its scoped event', async () => {
        const load = vi.fn(async () => firstSettings)
        const reportError = vi.fn()
        const store = new ActionRunSettingsStore('review', 'card-1', { load, reportError, save: vi.fn() })
        const otherStore = new ActionRunSettingsStore('review', 'card-2', { load, reportError, save: vi.fn() })
        const changed = vi.fn()
        const unrelatedChanged = vi.fn()
        store.addEventListener('changed', changed)
        otherStore.addEventListener('changed', unrelatedChanged)

        await store.load()

        expect(load).toHaveBeenCalledWith('card-1', 'review')
        expect(store.getSnapshot()).toMatchObject({ loading: false, settings: firstSettings })
        expect(changed).toHaveBeenCalledOnce()
        expect(unrelatedChanged).not.toHaveBeenCalled()
    })

    it('updates optimistically, persists complete settings, and retains waiting dirtiness until applied', async () => {
        const save = vi.fn(async () => undefined)
        const store = new ActionRunSettingsStore('review', 'card-1', {load: vi.fn(async () => null), reportError: vi.fn(), save})
        await store.load()

        store.setSettings(firstSettings, true)
        expect(store.getSnapshot()).toMatchObject({ settings: firstSettings, settingsChangedWhileWaiting: true })
        await vi.waitFor(() => expect(save).toHaveBeenCalledWith('card-1', 'review', firstSettings))

        store.markSettingsApplied()
        expect(store.getSnapshot().settingsChangedWhileWaiting).toBe(false)
        expect(store.getSnapshot().settings).toEqual(firstSettings)
    })

    it('rolls back only latest failed choice and permits retrying same choice', async () => {
        const firstSave = deferredVoid()
        const secondSave = deferredVoid()
        const save = vi.fn()
            .mockImplementationOnce(() => firstSave.promise)
            .mockImplementationOnce(() => secondSave.promise)
            .mockResolvedValueOnce(undefined)
        const reportError = vi.fn()
        const store = new ActionRunSettingsStore('review', 'card-1', {load: vi.fn(async () => null), reportError, save})
        await store.load()

        store.setSettings(firstSettings, false)
        store.setSettings(secondSettings, false)
        firstSave.reject(new Error('older failed'))
        await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
        expect(store.getSnapshot().settings).toEqual(secondSettings)

        secondSave.reject(new Error('latest failed'))
        await vi.waitFor(() => expect(store.getSnapshot().settings).toBeNull())
        store.setSettings(secondSettings, false)
        await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(3))
        expect(reportError).toHaveBeenCalledTimes(2)
    })

    it('reports load failure and does not expose defaults as loaded settings', async () => {
        const error = new Error('malformed activity')
        const reportError = vi.fn()
        const store = new ActionRunSettingsStore('review', 'card-1', {load: vi.fn(async () => { throw error }), reportError, save: vi.fn()})

        await store.load()

        expect(store.getSnapshot()).toEqual({loadError: error.message, loading: false, settings: null, settingsChangedWhileWaiting: false})
        expect(reportError).toHaveBeenCalledWith(error, 'Could not load action settings')
    })

    it('keeps non-card settings session-only', () => {
        const save = vi.fn()
        const store = new ActionRunSettingsStore('review', null, {load: vi.fn(), reportError: vi.fn(), save})

        store.setSettings(firstSettings, false)

        expect(store.getSnapshot().settings).toEqual(firstSettings)
        expect(save).not.toHaveBeenCalled()
    })
})

describe('ActionRunSettingsService', () => {
    it('keeps card/action stores independent and clears them when project changes', () => {
        const projectStateOwner = new ProjectStateOwner()
        const service = new ActionRunSettingsService()
        service.init(projectStateOwner)
        const first = service.getCardStore('card-1', 'review')
        first.setSettings(firstSettings, true)

        expect(service.getCardStore('card-1', 'review')).toBe(first)
        expect(service.getCardStore('card-1', 'review').getSnapshot().settingsChangedWhileWaiting).toBe(true)
        expect(service.getCardStore('card-1', 'build')).not.toBe(first)
        expect(service.getCardStore('card-2', 'review')).not.toBe(first)

        projectStateOwner.setProject({ branch: 'main', id: 'second' })
        expect(service.getCardStore('card-1', 'review')).not.toBe(first)
    })
})
