import { configService, type DiffViewType } from './config_service';
import { saveDesktopConfigToHost } from './desktop_config_transport';

/** Persists the application-wide diff layout before publishing the normalized host config. */
export async function setDiffViewType(diffViewType: DiffViewType) {
    const desktopConfig = { ...configService.getDesktopValues(), diffViewType };
    const persistedConfig = await saveDesktopConfigToHost(desktopConfig);
    configService.replaceDesktopConfig(persistedConfig);
}
