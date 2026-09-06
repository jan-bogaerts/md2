import { Checkbox, FormControlLabel, FormGroup, Stack, Typography } from '@mui/material'
import { memo, useCallback, type ChangeEvent } from 'react'
import {
    diagramEditSessionService, type DiagramEditSessionService,
} from '../../services/diagrams/diagram_edit_session_service'
import {
    useEditableDiagramGroupNodeIds,
    useEditableDiagramNodeField,
    useEditableDiagramNodeIds,
} from './use_editable_diagram'

interface DiagramGroupMembershipEditorProps {
    groupId: string
    session?: DiagramEditSessionService
}

interface DiagramGroupMemberRowProps {
    checked: boolean
    nodeId: string
    onToggle: (event: ChangeEvent<HTMLInputElement>) => void
    session: DiagramEditSessionService
}

/** One candidate node of the membership list, bound to its own label only. */
function DiagramGroupMemberRowLeaf({ checked, nodeId, onToggle, session }: DiagramGroupMemberRowProps) {
    const label = useEditableDiagramNodeField(nodeId, 'label', session)
    if (label === null) return null

    return (
        <FormControlLabel
            control={<Checkbox checked={checked} name={nodeId} onChange={onToggle} size="small" />}
            label={label}
        />
    )
}

/** Memoised so toggling one member cannot rerender the rows of the other nodes. */
const DiagramGroupMemberRow = memo(DiagramGroupMemberRowLeaf)

/** Edits group membership one node ID at a time; only nodes are listed, so groups never nest. */
function DiagramGroupMembershipEditorLeaf({
    groupId,
    session = diagramEditSessionService,
}: DiagramGroupMembershipEditorProps) {
    const nodeIds = useEditableDiagramNodeIds(session)
    const memberIds = useEditableDiagramGroupNodeIds(groupId, session)
    const handleToggle = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const { checked, name } = event.target
        if (checked) {
            session.addGroupMember(groupId, name)
            return
        }
        session.removeGroupMember(groupId, name)
    }, [groupId, session])
    if (memberIds === null) return null

    return (
        <Stack spacing={0.5}>
            <Typography variant="subtitle2">Members</Typography>
            {nodeIds.length === 0 ? (
                <Typography color="text.secondary" variant="body2">This diagram has no nodes.</Typography>
            ) : (
                <FormGroup>
                    {nodeIds.map((nodeId) => (
                        <DiagramGroupMemberRow
                            checked={memberIds.includes(nodeId)}
                            key={nodeId}
                            nodeId={nodeId}
                            onToggle={handleToggle}
                            session={session}
                        />
                    ))}
                </FormGroup>
            )}
        </Stack>
    )
}

/** Memoised so a dialog rerender caused by another field cannot rerender the membership list. */
export const DiagramGroupMembershipEditor = memo(DiagramGroupMembershipEditorLeaf)
