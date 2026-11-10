import { dataService } from '../data/data_service';
import { dialogService } from '../dialog_service';
import { openFilesService } from '../open_files_service';
import { workspaceViewService } from '../project/workspace_view_service';
import { cardPopupService } from '../card_popup_service';
import { jsonDataService } from './json_data_service';
import { resolveJsonProjectLink } from './json_link_path';
import type { WorkspaceViewMode } from '../project/workspace_view_service';

async function openResolvedJson(path: string, anchorElement: HTMLElement, viewMode: WorkspaceViewMode) {
    try {
        const document = await jsonDataService.open(path);
        if (viewMode === 'cards') {
            const popupDocument = openFilesService.openJsonPopupDocument(document);
            cardPopupService.openJsonData(popupDocument, anchorElement);
        }
        if (viewMode === 'text') openFilesService.openJsonDocument(document);
    } catch (error) {
        dialogService.error(error, { fallbackMessage: `JSON file could not be opened: ${path}` });
    }
}

/** Starts JSON navigation when link and current workspace view are eligible for application routing. */
export function routeJsonProjectLink(sourcePath: string, href: string, anchorElement: HTMLElement) {
    const { snapshot } = dataService.getState();
    const path = resolveJsonProjectLink(sourcePath, href, snapshot?.repositoryFiles ?? []);
    if (!path) return false;

    const { viewMode } = workspaceViewService.getSnapshot();
    if (viewMode !== 'cards' && viewMode !== 'text') return false;

    void openResolvedJson(path, anchorElement, viewMode);

    return true;
}
