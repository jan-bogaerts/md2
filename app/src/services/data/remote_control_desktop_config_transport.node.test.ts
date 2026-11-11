import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AGENT_ACCOUNTS } from '../../data/agent_accounts';
import { createTestClient, flushPromises, installWebSocket, openConnection } from '../test_support/mock_web_socket';
import { RemoteControlDesktopConfigTransport } from './remote_control_desktop_config_transport';

describe('RemoteControlDesktopConfigTransport', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('loads and saves complete host desktop config', async () => {
        installWebSocket();
        const client = createTestClient();
        const transport = new RemoteControlDesktopConfigTransport(client);
        const socket = await openConnection(client);
        const desktopConfig = {
            agentAccounts: DEFAULT_AGENT_ACCOUNTS,
            agentProfiles: [{ command: ['custom'], defaultThinkingLevel: 'none' as const, models: ['custom-model'], name: 'custom' }],
            agentSelection: {
                activeAgent: 'custom',
                permissionMode: 'full-access' as const,
                settingsByAgent: { custom: { model: 'custom-model', thinkingLevel: 'high' as const } },
            },
            codexSearchEnabled: false,
            editorCommand: 'code "{{file}}"',
            mergeConflictResolverCommand: '',
            remoteControlPort: 20877,
        };

        const load = transport.loadDesktopConfig();
        await flushPromises();
        expect(socket.request(0)).toMatchObject({ method: 'loadDesktopConfig', params: [] });
        socket.receive({ id: socket.request(0).id, result: desktopConfig });
        await expect(load).resolves.toEqual(desktopConfig);

        const save = transport.saveDesktopConfig(desktopConfig);
        await flushPromises();
        expect(socket.request(1)).toMatchObject({ method: 'saveDesktopConfig', params: [desktopConfig] });
        socket.receive({ id: socket.request(1).id, result: desktopConfig });
        await expect(save).resolves.toEqual(desktopConfig);
    });
});
