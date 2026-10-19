import SaveOutlined from '@mui/icons-material/SaveOutlined'
import { Button } from '@mui/material'
import { useSyncExternalStore } from 'react'
import { dialogService } from '../../../services/dialog_service'
import { diagramEditSessionService, type DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import { diagramSaveService, type DiagramSaveService } from '../../../services/diagrams/diagram_save_service'

/** Saves pending New diagram edits without opening Review. */
export function DiagramSaveButton({ save = diagramSaveService, session = diagramEditSessionService }: {
    save?: DiagramSaveService
    session?: DiagramEditSessionService
}) {
    const dirty = useSyncExternalStore(session.read.subscribeDirty, session.read.getDirtySnapshot, session.read.getDirtySnapshot)
    const status = useSyncExternalStore(save.subscribeStatus, save.getStatusSnapshot, save.getStatusSnapshot)
    const handleSave = async () => {
        try {
            await save.save()
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Edited diagram could not be saved' })
        }
    }

    return (
        <Button disabled={!dirty || status === 'saving'} onClick={handleSave} startIcon={<SaveOutlined />}>
            {status === 'saving' ? 'Saving…' : dirty ? 'Save' : 'Saved'}
        </Button>
    )
}
