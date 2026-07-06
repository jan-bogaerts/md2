export const OPEN_PROJECT_DIALOG_EVENT = 'md2:open-project-dialog'

export function requestOpenProjectDialog() {
    window.dispatchEvent(new CustomEvent(OPEN_PROJECT_DIALOG_EVENT))
}
