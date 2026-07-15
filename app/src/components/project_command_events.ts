import type { ProjectReference } from '../data/data_types'

export const OPEN_PROJECT_DIALOG_EVENT = 'md2:open-project-dialog'
export const OPEN_NEW_CARD_DIALOG_EVENT = 'md2:open-new-card-dialog'

export type ProjectDialogSource = 'github' | 'remote'

export interface OpenProjectDialogDetail {
    project?: ProjectReference
    source?: ProjectDialogSource
}

export function requestOpenProjectDialog(source?: ProjectDialogSource, project?: ProjectReference) {
    window.dispatchEvent(new CustomEvent<OpenProjectDialogDetail>(OPEN_PROJECT_DIALOG_EVENT, { detail: { project, source } }))
}

export function requestOpenNewCardDialog() {
    window.dispatchEvent(new CustomEvent(OPEN_NEW_CARD_DIALOG_EVENT))
}
