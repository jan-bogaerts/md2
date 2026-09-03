import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    APPLICATION_STATE_MIGRATION_KEY,
    APPLICATION_STATE_MIGRATION_VALUE,
    ApplicationStorage,
    MIGRATED_APPLICATION_STORAGE_KEYS,
} from './application_storage'
import type { ElectronApplicationStateBridge } from './electron_application_state_bridge'

function createBridge(initialValues: Record<string, string> = {}): ElectronApplicationStateBridge {
    const values = { ...initialValues }

    return {
        read: vi.fn(async (key = null) => key === null ? { ...values } : values[key] ?? null),
        remove: vi.fn(async (key) => {
            delete values[key]
        }),
        write: vi.fn(async (key, value) => {
            values[key] = value

            return value
        }),
    }
}

describe('application storage', () => {
    afterEach(() => {
        delete window.md2ApplicationState
        window.localStorage.clear()
        vi.restoreAllMocks()
    })

    it('keeps browser-only persistence in localStorage', async () => {
        const storage = new ApplicationStorage()

        await storage.initialize()
        storage.setItem('md2.lastProject', 'project-1')

        expect(storage.getItem('md2.lastProject')).toBe('project-1')
        expect(await storage.readCurrentItem('md2.lastProject')).toBe('project-1')
        expect(window.localStorage.getItem('md2.lastProject')).toBe('project-1')
    })

    it('loads desktop values into synchronous snapshot access', async () => {
        const bridge = createBridge({
            [APPLICATION_STATE_MIGRATION_KEY]: APPLICATION_STATE_MIGRATION_VALUE,
            'md2.themeMode': 'dark',
        })
        window.md2ApplicationState = bridge
        const storage = new ApplicationStorage()

        await storage.initialize()

        expect(storage.getItem('md2.themeMode')).toBe('dark')
        expect(bridge.read).toHaveBeenCalledWith(null)
    })

    it('migrates each known raw value once and records marker last', async () => {
        const bridge = createBridge()
        window.md2ApplicationState = bridge
        window.localStorage.setItem('md2.lastProject', '{bad-json')
        window.localStorage.setItem('md2.themeMode', 'dark')
        const storage = new ApplicationStorage()

        await storage.initialize()

        expect(storage.getItem('md2.lastProject')).toBe('{bad-json')
        expect(bridge.write).toHaveBeenNthCalledWith(1, 'md2.lastProject', '{bad-json')
        expect(bridge.write).toHaveBeenNthCalledWith(2, 'md2.themeMode', 'dark')
        expect(bridge.write).toHaveBeenLastCalledWith(APPLICATION_STATE_MIGRATION_KEY, APPLICATION_STATE_MIGRATION_VALUE)
        expect(MIGRATED_APPLICATION_STORAGE_KEYS).toContain('search-panel-results-size')
    })

    it('keeps existing desktop values when legacy values also exist', async () => {
        const bridge = createBridge({ 'md2.lastProject': 'desktop-project' })
        window.md2ApplicationState = bridge
        window.localStorage.setItem('md2.lastProject', 'legacy-project')
        const storage = new ApplicationStorage()

        await storage.initialize()

        expect(storage.getItem('md2.lastProject')).toBe('desktop-project')
        expect(bridge.write).not.toHaveBeenCalledWith('md2.lastProject', 'legacy-project')
    })

    it('does not read legacy localStorage after completed migration', async () => {
        const bridge = createBridge({ [APPLICATION_STATE_MIGRATION_KEY]: APPLICATION_STATE_MIGRATION_VALUE })
        window.md2ApplicationState = bridge
        const getItem = vi.spyOn(Storage.prototype, 'getItem')
        const storage = new ApplicationStorage()

        await storage.initialize()
        storage.getItem('md2.themeMode')
        storage.setItem('md2.themeMode', 'dark')
        storage.removeItem('md2.themeMode')

        expect(getItem).not.toHaveBeenCalled()
        expect(bridge.write).toHaveBeenCalledWith('md2.themeMode', 'dark')
        expect(bridge.remove).toHaveBeenCalledWith('md2.themeMode')
    })

    it('does not record marker when a migration write fails', async () => {
        const bridge = createBridge()
        window.md2ApplicationState = bridge
        window.localStorage.setItem('md2.lastProject', 'legacy-project')
        vi.mocked(bridge.write).mockRejectedValueOnce(new Error('disk full'))
        const storage = new ApplicationStorage()

        await expect(storage.initialize()).rejects.toThrow('disk full')

        expect(bridge.write).not.toHaveBeenCalledWith(APPLICATION_STATE_MIGRATION_KEY, APPLICATION_STATE_MIGRATION_VALUE)
    })

    it('refreshes one desktop key before concurrent read-modify-write work', async () => {
        const bridge = createBridge({
            [APPLICATION_STATE_MIGRATION_KEY]: APPLICATION_STATE_MIGRATION_VALUE,
            'md2.recentLocalRepositories': '["C:/first"]',
        })
        window.md2ApplicationState = bridge
        const storage = new ApplicationStorage()
        await storage.initialize()
        vi.mocked(bridge.read).mockResolvedValueOnce('["C:/second","C:/first"]')

        await expect(storage.readCurrentItem('md2.recentLocalRepositories')).resolves.toBe('["C:/second","C:/first"]')
        expect(storage.getItem('md2.recentLocalRepositories')).toBe('["C:/second","C:/first"]')
    })
})
