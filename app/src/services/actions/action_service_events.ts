export const ACTIONS_CHANGED_EVENT = 'actionsChanged'
export const ACTION_DRAFT_CHANGED_EVENT = 'draftChanged'
export const ACTION_PERSISTENCE_CHANGED_EVENT = 'persistenceChanged'

export interface ActionDraftChangedDetail {
    actionId: string
}
