import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActionDefinition } from '../../../../data/action_types'
import { setActionBridgeOverride, type ElectronActionBridge } from '../../../../data/electron_action_bridge'
import { activeScheduleService } from '../../../../services/actions/active_schedule_service'
import { dataService } from '../../../../services/data/data_service'
import { projectAccessService } from '../../../../services/project/project_access_service'
import { projectPersistenceService } from '../../../../services/project/project_persistence_service';
import { actionService } from '../../../../services/actions/action_service';
import { defaultConvertPromptToAction, defaultPreparePrompt, defaultScheduleAction } from './action_popup_defaults';

describe('defaultPreparePrompt', () => {
    afterEach(() => {
        setActionBridgeOverride(null);
        vi.restoreAllMocks();
    });

    it.each([true, false])('flushes only pending action definitions before preparation: pending=%s', async (pending) => {
        const prepared = { prompt: 'Current definition' };
        const prepareActionPrompt = vi.fn(async () => prepared);
        setActionBridgeOverride({ prepareActionPrompt } as unknown as ElectronActionBridge);
        vi.spyOn(actionService.draftStore, 'hasPendingDrafts').mockReturnValue(pending);
        const flushDrafts = vi.spyOn(actionService.draftStore, 'flushDrafts').mockResolvedValue();
        const flushProject = vi.spyOn(projectPersistenceService, 'flushPendingChanges').mockResolvedValue();
        const writePendingFiles = vi.spyOn(dataService, 'writePendingFiles').mockResolvedValue();
        const action = { id: 'review' } as ActionDefinition;
        const context = { cardInternalId: 'card-1', kind: 'card' as const };

        await expect(defaultPreparePrompt(action, context)).resolves.toBe(prepared);

        expect(flushDrafts).toHaveBeenCalledTimes(pending ? 1 : 0);
        expect(flushProject).not.toHaveBeenCalled();
        expect(prepareActionPrompt).toHaveBeenCalledWith({ actionId: action.id, context });
        expect(writePendingFiles).toHaveBeenCalledOnce();
        expect(writePendingFiles.mock.invocationCallOrder[0]).toBeLessThan(prepareActionPrompt.mock.invocationCallOrder[0]);
        if (pending) {
            expect(flushDrafts.mock.invocationCallOrder[0]).toBeLessThan(writePendingFiles.mock.invocationCallOrder[0]);
        }
    });

    it('reports action flush failure without preparing stale definitions', async () => {
        const failure = new Error('Action save failed');
        const prepareActionPrompt = vi.fn();
        setActionBridgeOverride({ prepareActionPrompt } as unknown as ElectronActionBridge);
        vi.spyOn(actionService.draftStore, 'hasPendingDrafts').mockReturnValue(true);
        vi.spyOn(actionService.draftStore, 'flushDrafts').mockRejectedValue(failure);

        await expect(defaultPreparePrompt({ id: 'review' } as ActionDefinition, { kind: 'project' })).rejects.toBe(failure);
        expect(prepareActionPrompt).not.toHaveBeenCalled();
    });

    it('reports a pending file write failure without preparing from stale files', async () => {
        const failure = new Error('Disk write failed');
        const prepareActionPrompt = vi.fn();
        setActionBridgeOverride({ prepareActionPrompt } as unknown as ElectronActionBridge);
        vi.spyOn(actionService.draftStore, 'hasPendingDrafts').mockReturnValue(false);
        vi.spyOn(dataService, 'writePendingFiles').mockRejectedValue(failure);

        await expect(defaultPreparePrompt({ id: 'review' } as ActionDefinition, { kind: 'project' })).rejects.toBe(failure);
        expect(prepareActionPrompt).not.toHaveBeenCalled();
    });
});

describe('defaultScheduleAction', () => {
    afterEach(() => {
        setActionBridgeOverride(null)
        vi.restoreAllMocks()
    })

    it('refreshes active schedule view after backend registration succeeds', async () => {
        const registerActionSchedule = vi.fn(async () => undefined)
        setActionBridgeOverride({ registerActionSchedule } as unknown as ElectronActionBridge)
        projectAccessService.setReadOnly(false)
        const refresh = vi.spyOn(activeScheduleService, 'refresh').mockResolvedValue(undefined)
        const action = { id: 'implement' } as ActionDefinition
        const context = { cardInternalId: 'card-1', kind: 'card' as const }
        const trigger = { timestamp: '2026-09-19T10:00:00.000Z', type: 'at' as const }

        await defaultScheduleAction(action, context, trigger)

        expect(registerActionSchedule).toHaveBeenCalledWith({ actionId: 'implement', context, trigger })
        expect(refresh).toHaveBeenCalledOnce()
    })

    it('does not refresh or claim success when registration fails', async () => {
        const failure = new Error('Scheduler unavailable')
        const registerActionSchedule = vi.fn(async () => { throw failure })
        setActionBridgeOverride({ registerActionSchedule } as unknown as ElectronActionBridge)
        projectAccessService.setReadOnly(false)
        const refresh = vi.spyOn(activeScheduleService, 'refresh').mockResolvedValue(undefined)

        await expect(defaultScheduleAction(
            { id: 'implement' } as ActionDefinition,
            { cardInternalId: 'card-1', kind: 'card' },
            { timestamp: '2099-07-07T10:30:00.000Z', type: 'at' },
        )).rejects.toBe(failure)
        expect(refresh).not.toHaveBeenCalled()
    })

    it('reports refresh failure after registration so schedule popover stays open', async () => {
        setActionBridgeOverride({ registerActionSchedule: vi.fn(async () => undefined) } as unknown as ElectronActionBridge)
        projectAccessService.setReadOnly(false)
        vi.spyOn(activeScheduleService, 'refresh').mockResolvedValue(undefined)
        vi.spyOn(activeScheduleService, 'getSnapshot').mockReturnValue({...activeScheduleService.getSnapshot(), error: 'Could not load schedules'})

        await expect(defaultScheduleAction(
            { id: 'implement' } as ActionDefinition,
            { cardInternalId: 'card-1', kind: 'card' },
            { timestamp: '2026-09-19T10:00:00.000Z', type: 'at' },
        )).rejects.toThrow('Could not load schedules')
    })
})

describe('defaultConvertPromptToAction', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('writes a streaming agent action with selected settings', async () => {
        vi.spyOn(dataService, 'getConfig').mockReturnValue({ actionsFolder: 'actions' } as never)
        vi.spyOn(dataService, 'getState').mockReturnValue({ snapshot: { repositoryFiles: [] } } as never)
        const saveProjectFile = vi.spyOn(dataService.cards, 'saveProjectFile').mockImplementation(async (file) => file)
        const context = { cardInternalId: 'card-1', kind: 'card' as const, type: 'feature' }

        const { definition, path } = await defaultConvertPromptToAction({
            agent: 'codex', context, label: 'Review result', model: 'gpt-5.5',
            permissionMode: 'ask-for-approval', prompt: 'Review this result',
        })

        expect(path).toBe('actions/review-result.json')
        expect(definition.streaming).toBe(true)
        const savedFile = saveProjectFile.mock.calls[0]?.[0]
        if (!savedFile) throw new Error('Missing saved action file')
        expect(JSON.parse(savedFile.content)).toMatchObject({
            agent: 'codex', model: 'gpt-5.5', permissionMode: 'ask-for-approval',
            streaming: true, type: 'agent',
        })
    })
})
