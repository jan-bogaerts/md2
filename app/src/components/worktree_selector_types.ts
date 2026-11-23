import type { WorktreeAssignment } from '../data/data_types'

export type WorktreeAssignmentTarget = { cardInternalId: string, kind: 'card', path: string } | { kind: 'project' }

export interface WorktreeSelectorProps {
    assignment: WorktreeAssignment
    assignmentTarget: WorktreeAssignmentTarget
    disabled?: boolean
    disabledReason?: string
    labelPrefix?: string
    primaryPath: string | null
}
