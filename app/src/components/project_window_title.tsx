import { useEffect } from 'react'
import { useProjectState } from './hooks/use_project_state'
import { projectName } from './shell/menu/project_name'
import { dataService, type DataService } from '../services/data/data_service'
import { dialogService } from '../services/dialog_service'

const DEFAULT_WINDOW_TITLE = 'MD²'

interface ProjectWindowTitleProps {
    service?: DataService
}

/** Keeps the browser and Electron window title aligned with the active project. */
export function ProjectWindowTitle({ service = dataService }: ProjectWindowTitleProps) {
    const { project } = useProjectState(service)

    useEffect(() => {
        document.title = DEFAULT_WINDOW_TITLE

        try {
            if (project) document.title = `${projectName(project)} — ${DEFAULT_WINDOW_TITLE}`
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Project window title could not be updated' })
        }

        return () => {
            document.title = DEFAULT_WINDOW_TITLE
        }
    }, [project])

    return null
}
