export const OPEN_PROJECT_DIALOG_EVENT = 'md2:open-project-dialog'
export const WORKSPACE_ERROR_EVENT = 'md2:workspace-error'

export function requestOpenProjectDialog() {
    window.dispatchEvent(new CustomEvent(OPEN_PROJECT_DIALOG_EVENT))
}

export function reportWorkspaceError(message: string) {
    window.dispatchEvent(new CustomEvent<string>(WORKSPACE_ERROR_EVENT, { detail: message }))
}
