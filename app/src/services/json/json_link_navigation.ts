import { dataService } from '../data/data_service';
import { dialogService } from '../dialog_service';
import { openFilesService } from '../open_files_service';
import { workspaceViewService } from '../project/workspace_view_service';
import { cardPopupService } from '../card_popup_service';
import { jsonDataService } from './json_data_service';
import { resolveJsonLink, type JsonLinkTarget } from './json_link_path';
import type { WorkspaceViewMode } from '../project/workspace_view_service';

async function openResolvedJson(target: JsonLinkTarget, anchorElement: HTMLElement, viewMode: WorkspaceViewMode) {
    try {
        const document = target.kind === 'project'
            ? await jsonDataService.open(target.path)
            : await jsonDataService.openLocal(target.path);
        if (viewMode === 'cards') {
            const popupDocument = openFilesService.openJsonPopupDocument(document);
            cardPopupService.openJsonData(popupDocument, anchorElement);
        }
        if (viewMode === 'text') openFilesService.openJsonDocument(document);
    } catch (error) {
        dialogService.error(error, { fallbackMessage: `JSON file could not be opened: ${target.path}` });
    }
}

/** Starts JSON navigation when link and current workspace view are eligible for application routing. */
export function routeJsonLink(sourcePath: string, href: string, anchorElement: HTMLElement) {
    const { project, snapshot } = dataService.getState();
    const target = resolveJsonLink(sourcePath, href, project?.rootPath ?? null, snapshot?.repositoryFiles ?? []);
    if (!target) return false;

    const { viewMode } = workspaceViewService.getSnapshot();
    if (viewMode !== 'cards' && viewMode !== 'text') return false;

    void openResolvedJson(target, anchorElement, viewMode);

    return true;
}
