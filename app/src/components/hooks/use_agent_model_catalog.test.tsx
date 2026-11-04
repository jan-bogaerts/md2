import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mergeAgentProfiles } from '../../data/agent_profiles';
import { AgentCapabilitiesService } from '../../services/agents/agent_capabilities_service';
import { agentCatalogFixture } from '../../test/agent_catalog_fixture';
import { useAgentModelCatalog } from './use_agent_model_catalog';

const profile = mergeAgentProfiles([])[0];

describe('useAgentModelCatalog', () => {
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('keeps a loaded catalog until manual refresh is requested', async () => {
        vi.useFakeTimers();
        const getModelCatalog = vi.fn(async () => agentCatalogFixture(profile));
        const service = new AgentCapabilitiesService({getAgentAvailability: vi.fn(async () => ({})), getConnectionIdentity: () => 'host', getModelCatalog});
        await service.loadCatalog(profile);
        const { result } = renderHook(() => useAgentModelCatalog(profile, undefined, service));
        await act(async () => { await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000); });

        expect(getModelCatalog).toHaveBeenCalledOnce();
        await act(async () => { await result.current.refresh(); });
        expect(getModelCatalog).toHaveBeenCalledTimes(2);
        expect(getModelCatalog).toHaveBeenLastCalledWith(profile, undefined, true);
    });

    it('does not automatically retry a catalog after a failed manual refresh', async () => {
        const getModelCatalog = vi.fn(async () => agentCatalogFixture(profile));
        const service = new AgentCapabilitiesService({getAgentAvailability: vi.fn(async () => ({})), getConnectionIdentity: () => 'host', getModelCatalog});
        await service.loadCatalog(profile);
        getModelCatalog.mockRejectedValueOnce(new Error('Discovery failed'));
        await service.loadCatalog(profile, undefined, true);
        renderHook(() => useAgentModelCatalog(profile, undefined, service));

        expect(service.getCatalogSnapshot(profile.name).error).toBe('Discovery failed');
        expect(getModelCatalog).toHaveBeenCalledTimes(2);
    });

    it('switches to the selected account catalog without reusing another account list', async () => {
        const workAccountId = '11111111-1111-4111-8111-111111111111';
        const getModelCatalog = vi.fn(async (_profile: typeof profile, accountId: string | undefined) => (
            agentCatalogFixture(profile, [accountId ? 'work-model' : 'initial-model'], accountId ?? 'codex-initial')
        ));
        const service = new AgentCapabilitiesService({getAgentAvailability: vi.fn(async () => ({})), getConnectionIdentity: () => 'host', getModelCatalog});
        const { result, rerender } = renderHook(
            ({ accountId }) => useAgentModelCatalog(profile, accountId, service),
            { initialProps: { accountId: undefined as string | undefined } },
        );
        await waitFor(() => expect(result.current.catalog?.models[0].id).toBe('initial-model'));

        rerender({ accountId: workAccountId });

        await waitFor(() => expect(result.current.catalog?.models[0].id).toBe('work-model'));
        expect(getModelCatalog).toHaveBeenLastCalledWith(profile, workAccountId, false);
    });
});
