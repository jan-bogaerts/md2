import { afterEach, describe, expect, it, vi } from 'vitest';
import { configService } from './config_service';
import { setDesktopConfigTransportOverride } from './desktop_config_transport';
import { setDiffViewType } from './diff_view_config';

describe('setDiffViewType', () => {
    afterEach(() => {
        configService.clear();
        setDesktopConfigTransportOverride(null);
    });

    it('keeps the published view when desktop config persistence fails', async () => {
        const saveError = new Error('Save failed');
        configService.init({ desktopConfig: { diffViewType: 'split' } });
        setDesktopConfigTransportOverride({
            loadDesktopConfig: vi.fn(async () => configService.getDesktopValues()),
            saveDesktopConfig: vi.fn(async () => { throw saveError; }),
        });

        await expect(setDiffViewType('unified')).rejects.toBe(saveError);

        expect(configService.get('desktop.diffViewType')).toBe('split');
    });
});
