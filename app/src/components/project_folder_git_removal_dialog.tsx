import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import { projectFolderGitInclusionService } from '../services/project/project_folder_git_inclusion_service'
import { usePendingProjectFolderGitRemoval } from './hooks/use_project_folder_git_removal'

/** Blocking confirmation before tracked project-folder files are removed from the Git index. */
export function ProjectFolderGitRemovalDialog() {
    const projectFolder = usePendingProjectFolderGitRemoval()

    const handleCancel = () => {
        projectFolderGitInclusionService.cancelRemoval()
    }

    const handleConfirm = () => {
        projectFolderGitInclusionService.confirmRemoval()
    }

    return (
        <Dialog aria-labelledby="project-folder-git-removal-title" onClose={handleCancel} open={projectFolder !== null}>
            <DialogTitle id="project-folder-git-removal-title">Keep project folder out of Git?</DialogTitle>
            <DialogContent>
                <DialogContentText>
                    {`Git currently tracks files in ${projectFolder ?? ''}. MD² will remove the folder from the Git index, add it to .gitignore, and commit that change. The files stay on disk.`}
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleCancel}>Cancel</Button>
                <Button color="error" onClick={handleConfirm} variant="contained">Remove from Git</Button>
            </DialogActions>
        </Dialog>
    )
}
