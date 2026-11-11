import type { DesktopConfigValues } from '../config/config_entries';
import type { DesktopConfigTransport } from '../config/desktop_config_transport';
import type { RemoteControlClient } from './remote_control_client';

/** Desktop config transport backed by one remote-control client. */
export class RemoteControlDesktopConfigTransport implements DesktopConfigTransport {
    private readonly client: RemoteControlClient;

    constructor(client: RemoteControlClient) {
        this.client = client;
    }

    async loadDesktopConfig(): Promise<DesktopConfigValues> {
        return this.client.request<DesktopConfigValues>('loadDesktopConfig', []);
    }

    async saveDesktopConfig(values: DesktopConfigValues): Promise<DesktopConfigValues> {
        return this.client.request<DesktopConfigValues>('saveDesktopConfig', [values]);
    }
}
