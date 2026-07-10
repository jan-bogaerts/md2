import { dialogService } from '../services/dialog_service'

export const OPEN_PROJECT_DIALOG_EVENT = 'md2:open-project-dialog'

export function requestOpenProjectDialog() {
    window.dispatchEvent(new CustomEvent(OPEN_PROJECT_DIALOG_EVENT))
}

export function reportWorkspaceError(message: string) {
    dialogService.error(message)
}
