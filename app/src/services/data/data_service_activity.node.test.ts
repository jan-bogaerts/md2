import { afterEach, describe, expect, it, vi } from 'vitest'
import { createActivityFile } from '../../../../shared/card_activity.mjs'
import type { MarkdownFile } from '../../data/data_types'
import { configService } from '../config/config_service'
import { createDataService, createStorage } from '../test_support/data_service_test_support'

const activityPath = 'design/releases/0_7_0/activity/card__card-1.json'
const cardFile: MarkdownFile = {
    content: `---\nid: F-1\ninternalId: card-1\ntitle: Card\nstatus: archived\nagents:\n  - ${activityPath}\n---\n`,
    path: 'design/archive/F-1-card.md',
}

describe('DataService.loadReferencedCardActivities', () => {
    afterEach(() => configService.clear())

    it('loads recorded path and checks card internal ID', async () => {
        configService.init()
        const activity = createActivityFile({ cardInternalId: 'card-1', kind: 'card' })
        const loadTextFile = vi.fn(async (_project, path: string) => ({ content: JSON.stringify(activity), path }))
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadTextFile,
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.loadReferencedCardActivities('card-1')).resolves.toEqual([activity])
        expect(loadTextFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'project' }), activityPath)
    })

    it('rejects missing or wrong-card activity instead of returning empty history', async () => {
        configService.init()
        const otherActivity = createActivityFile({ cardInternalId: 'card-2', kind: 'card' })
        const loadTextFile = vi.fn(async (_project, path: string) => ({ content: JSON.stringify(otherActivity), path }))
        const storage = createStorage({
            loadProject: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadProjectRoot: vi.fn(async () => ({ files: [cardFile], workingFolder: 'design' })),
            loadTextFile,
        })
        const service = createDataService()
        service.init({ storage })
        await service.projectLoading.openProject({ branch: 'main', id: 'project' })

        await expect(service.loadReferencedCardActivities('card-1')).rejects.toThrow()
        loadTextFile.mockRejectedValue(new Error('Activity file missing'))
        await expect(service.loadReferencedCardActivities('card-1')).rejects.toThrow('Activity file missing')
    })
})
