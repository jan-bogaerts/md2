import type { ProjectReference } from '../data/data_types'
import type { ProjectOpenResolution } from '../services/project/project_session_service'

export const OPEN_PROJECT_DIALOG_EVENT = 'md2:open-project-dialog'
export const OPEN_NEW_CARD_DIALOG_EVENT = 'md2:open-new-card-dialog'

export type ProjectDialogSource = 'github' | 'remote'

export interface OpenProjectDialogDetail {
    project?: ProjectReference
    resolution?: ProjectOpenResolution
    source?: ProjectDialogSource
}

export interface OpenNewCardDialogDetail {
    status?: string
}

export function requestOpenProjectDialog(source?: ProjectDialogSource, project?: ProjectReference, resolution?: ProjectOpenResolution) {
    window.dispatchEvent(new CustomEvent<OpenProjectDialogDetail>(OPEN_PROJECT_DIALOG_EVENT, { detail: { project, resolution, source } }))
}

export function requestOpenNewCardDialog(status?: string) {
    window.dispatchEvent(new CustomEvent<OpenNewCardDialogDetail>(OPEN_NEW_CARD_DIALOG_EVENT, { detail: { status } }))
}
