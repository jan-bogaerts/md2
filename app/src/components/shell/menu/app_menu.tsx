import { IconButton, Tooltip } from '@mui/material'
import CloudUpload from 'mdi-material-ui/CloudUpload'
import { dataService } from '../../../services/data_service'
import { reportWorkspaceError } from '../../project_command_events'
import { useProjectState } from '../../hooks/use_project_state'
import { Menu } from './menu'
import { Section } from './section'
import { Tab } from './tab'

/** Reusable app menu hosting cross-cutting workspace actions such as Push. */
export function AppMenu() {
    const { project } = useProjectState()
    const isProjectOpen = !!project

    const handlePushClick = async () => {
        if (!isProjectOpen) return

        try {
            await dataService.push()
        } catch (error) {
            reportWorkspaceError(error instanceof Error ? error.message : 'Push failed')
        }
    }

    return (
        <Menu>
            <Tab>
                <Section label="Actions">
                    <Tooltip title={isProjectOpen ? 'Push' : 'Open a project to push'}>
                        <span>
                            <IconButton aria-label="Push" disabled={!isProjectOpen} onClick={() => void handlePushClick()}>
                                <CloudUpload />
                            </IconButton>
                        </span>
                    </Tooltip>
                </Section>
            </Tab>
        </Menu>
    )
}
