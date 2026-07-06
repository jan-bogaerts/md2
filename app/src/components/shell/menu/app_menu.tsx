import { FormControl, IconButton, MenuItem, Select, TextField, Tooltip } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import CloudUpload from 'mdi-material-ui/CloudUpload'
import { defaultModelForProfile, findAgentProfile, mergeAgentProfiles, type AgentProfile } from '../../../data/agent_profiles'
import { configService } from '../../../services/config_service'
import { dataService } from '../../../services/data_service'
import { getElectronConfigBridge } from '../../../services/electron_config_bridge'
import { reportWorkspaceError } from '../../project_command_events'
import { useProjectState } from '../../hooks/use_project_state'
import { Menu } from './menu'
import { Section } from './section'
import { Tab } from './tab'

/** Reusable app menu hosting cross-cutting workspace actions such as Push. */
export function AppMenu() {
    if (!configService.isInitialized()) configService.init({ desktopConfig: null })

    const { project } = useProjectState()
    const isProjectOpen = !!project
    const desktopAvailable = configService.hasDesktopConfig()
    const agentProfiles = mergeAgentProfiles(configService.get('desktop.agentProfiles') as AgentProfile[])
    const [selectedAgent, setSelectedAgent] = useState(() => configService.get('desktop.agent') as string)
    const selectedProfile = findAgentProfile(agentProfiles, selectedAgent)
    const selectedModels = selectedProfile?.models ?? []
    const [selectedModel, setSelectedModel] = useState(() => (configService.get('desktop.model') as string) || (selectedProfile ? defaultModelForProfile(selectedProfile) : ''))

    const persistDesktopConfig = () => {
        if (!configService.hasDesktopConfig()) return

        getElectronConfigBridge()?.setDesktopConfig(configService.getDesktopValues())
    }

    const handlePushClick = async () => {
        if (!isProjectOpen) return

        try {
            await dataService.push()
        } catch (error) {
            reportWorkspaceError(error instanceof Error ? error.message : 'Push failed')
        }
    }

    const handleAgentChange = (event: SelectChangeEvent) => {
        const profile = findAgentProfile(agentProfiles, event.target.value)
        const nextModel = profile ? defaultModelForProfile(profile) : ''
        setSelectedAgent(event.target.value)
        setSelectedModel(nextModel)
        configService.set('desktop.agent', event.target.value)
        configService.set('desktop.model', nextModel)
        persistDesktopConfig()
    }

    const handleModelChange = (event: SelectChangeEvent | ChangeEvent<HTMLInputElement>) => {
        setSelectedModel(event.target.value)
        configService.set('desktop.model', event.target.value)
        persistDesktopConfig()
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
                <Section label="Default agent">
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <Select
                            aria-label="Default agent"
                            disabled={!desktopAvailable}
                            onChange={handleAgentChange}
                            value={selectedAgent}
                        >
                            {agentProfiles.map((profile) => (
                                <MenuItem key={profile.name} value={profile.name}>{profile.name}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {selectedModels.length > 0 ? (
                        <FormControl size="small" sx={{ minWidth: 140 }}>
                            <Select
                                aria-label="Default model"
                                disabled={!desktopAvailable}
                                onChange={handleModelChange}
                                value={selectedModel}
                            >
                                {selectedModels.map((model) => (
                                    <MenuItem key={model} value={model}>{model}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    ) : (
                        <TextField
                            aria-label="Default model"
                            disabled={!desktopAvailable}
                            onChange={handleModelChange}
                            size="small"
                            sx={{ width: 140 }}
                            value={selectedModel}
                        />
                    )}
                </Section>
            </Tab>
        </Menu>
    )
}
