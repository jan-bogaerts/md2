import { Alert, Box, Button, Divider, Stack, Tab, Tabs, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { navigateTo } from '../../app/app_navigation'
import { CONFIG_SECTIONS, configService, type ConfigKey } from '../../services/config_service'
import { dataService } from '../../services/data_service'
import { getElectronConfigBridge } from '../../services/electron_config_bridge'
import { ConfigValueEditor } from './config_value_editor'

const CONFIG_PAGE_PADDING = 3
const CONFIG_SIDEBAR_WIDTH = 220
const DRAFT_DISCARD_DELAY_MS = 0

interface ConfigPageProps {
    hash: string
}

function getActiveSection(hash: string) {
    const section = hash.replace('#', '')
    if (CONFIG_SECTIONS.some((item) => item.id === section)) return section

    return CONFIG_SECTIONS[0].id
}

function getConfigDraftSnapshot() {
    return configService.getDraft()
}

function subscribeToConfigChanges(onStoreChange: () => void) {
    configService.addEventListener('changed', onStoreChange)

    return () => configService.removeEventListener('changed', onStoreChange)
}

export function ConfigPage(props: ConfigPageProps) {
    const { hash } = props
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const draft = useSyncExternalStore(subscribeToConfigChanges, getConfigDraftSnapshot)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const draftDiscardTimeoutRef = useRef<number | null>(null)
    const entries = configService.getEntries()
    const visibleSections = useMemo(
        () => CONFIG_SECTIONS.filter((section) => entries.some((entry) => entry.section === section.id)),
        [entries],
    )
    const activeSection = getActiveSection(hash)

    useEffect(() => {
        if (draftDiscardTimeoutRef.current !== null) {
            window.clearTimeout(draftDiscardTimeoutRef.current)
            draftDiscardTimeoutRef.current = null
        }

        const currentDraft = configService.getDraft()
        if (!currentDraft) configService.loadDraft()

        return () => {
            draftDiscardTimeoutRef.current = window.setTimeout(() => {
                configService.discardDraft()
                draftDiscardTimeoutRef.current = null
            }, DRAFT_DISCARD_DELAY_MS)
        }
    }, [])

    const handleValueChange = (key: ConfigKey, value: unknown) => {
        try {
            configService.setDraftValue(key, value)
            setErrorMessage(null)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Invalid config value')
        }
    }

    const handleSaveClick = async () => {
        try {
            configService.saveDraft()
            if (configService.hasProjectConfig()) await dataService.saveProjectConfig()
            if (configService.hasDesktopConfig()) getElectronConfigBridge()?.setDesktopConfig(configService.getDesktopValues())
            configService.loadDraft()
            setErrorMessage(null)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Config save failed')
        }
    }

    const handleCancelClick = () => {
        configService.discardDraft()
        navigateTo('/')
    }

    if (!draft) return null

    const sectionTabs = (
        <Tabs
            aria-label="Config sections"
            orientation={isMobile ? 'horizontal' : 'vertical'}
            scrollButtons="auto"
            value={activeSection}
            variant="scrollable"
        >
            {visibleSections.map((section) => (
                <Tab component="a" href={`#${section.id}`} key={section.id} label={section.label} value={section.id} />
            ))}
        </Tabs>
    )

    return (
        <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'auto' }}>
            {!isMobile ? <Box sx={{ borderRight: 1, borderColor: 'divider', flexShrink: 0, width: CONFIG_SIDEBAR_WIDTH }}>{sectionTabs}</Box> : null}
            <Box sx={{ flex: 1, minWidth: 0, p: CONFIG_PAGE_PADDING }}>
                <Stack spacing={3}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
                        <Typography component="h2" sx={{ flexGrow: 1 }} variant="h5">
                            Config
                        </Typography>
                        <Button onClick={handleCancelClick} variant="outlined">
                            Cancel
                        </Button>
                        <Button onClick={handleSaveClick} variant="contained">
                            Save
                        </Button>
                    </Stack>

                    {isMobile ? sectionTabs : null}
                    {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

                    {visibleSections.map((section) => (
                        <Box component="section" id={section.id} key={section.id} sx={{ scrollMarginTop: CONFIG_PAGE_PADDING }}>
                            <Stack spacing={2}>
                                <Typography component="h3" sx={{ fontWeight: 700, textDecoration: 'underline' }} variant="h6">
                                    {section.label}
                                </Typography>
                                {entries.filter((entry) => entry.section === section.id).map((entry) => (
                                    <ConfigValueEditor
                                        disabled={entry.source === 'desktop' && !configService.hasDesktopConfig()}
                                        entry={entry}
                                        key={entry.key}
                                        onChange={handleValueChange}
                                        value={draft[entry.key]}
                                        values={draft}
                                    />
                                ))}
                                <Divider />
                            </Stack>
                        </Box>
                    ))}
                </Stack>
            </Box>
        </Box>
    )
}
