export const OPEN_PROJECT_DIALOG_EVENT = 'md2:open-project-dialog'
export const OPEN_NEW_CARD_DIALOG_EVENT = 'md2:open-new-card-dialog'

export function requestOpenProjectDialog() {
    window.dispatchEvent(new CustomEvent(OPEN_PROJECT_DIALOG_EVENT))
}

export function requestOpenNewCardDialog() {
    window.dispatchEvent(new CustomEvent(OPEN_NEW_CARD_DIALOG_EVENT))
}
