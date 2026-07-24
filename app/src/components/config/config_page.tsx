import { Box, Button, Stack, Tab, Tabs, Typography, useMediaQuery, useTheme } from '@mui/material'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { navigateTo } from '../../app/app_navigation'
import { CONFIG_SECTIONS, configService, type ConfigEntry, type ConfigKey } from '../../services/config/config_service'
import { writeDesktopConfigToBridge } from '../../services/config/config_persistence'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'
import { DesktopConfigSection } from './desktop_config_section'
import { ProjectConfigSection } from './project_config_section'
import { ReactConfigSection } from './react_config_section'
import { useAppTheme } from '../../theme/use_app_theme'
import {
    cloneMarkdownStyleConfig,
    isMarkdownStyleConfig,
    isMarkdownStylePresetName,
    type MarkdownStyleConfig,
    type MarkdownStyleName,
} from '../../theme/theme_config'
import { MarkdownConfigSection } from './markdown_config_section'

const CONFIG_PAGE_PADDING = 3
const CONFIG_FORM_MAX_WIDTH = 720
const CONFIG_SIDEBAR_WIDTH = 220
const DRAFT_DISCARD_DELAY_MS = 0
const MARKDOWN_CONFIG_SECTION = { id: 'markdown', label: 'Markdown' }

interface MarkdownStyleDraft {
    config: MarkdownStyleConfig
    name: MarkdownStyleName
}

interface ConfigPageProps {
    hash: string
}

function getActiveSection(hash: string, sections: typeof CONFIG_SECTIONS) {
    if (sections.length === 0) throw new Error('Config page requires at least one visible section')

    const section = hash.replace('#', '')
    if (sections.some((item) => item.id === section)) return section

    return sections[0].id
}

function getVisibleSections(entries: ConfigEntry[]) {
    return CONFIG_SECTIONS.flatMap((section) => {
        const visibleSection = entries.some((entry) => entry.section === section.id) ? [section] : []
        return section.id === 'react' ? [...visibleSection, MARKDOWN_CONFIG_SECTION] : visibleSection
    })
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
    const {
        markdownStyle,
        markdownStyleConfig,
        setCustomMarkdownStyle,
        setMarkdownStyle,
    } = useAppTheme()
    const draft = useSyncExternalStore(subscribeToConfigChanges, getConfigDraftSnapshot)
    const [invalidConfigKeys, setInvalidConfigKeys] = useState<Set<ConfigKey>>(() => new Set())
    const [markdownStyleDraft, setMarkdownStyleDraft] = useState<MarkdownStyleDraft>(() => ({
        config: cloneMarkdownStyleConfig(markdownStyleConfig),
        name: markdownStyle,
    }))
    const draftDiscardTimeoutRef = useRef<number | null>(null)
    const entries = configService.getEntries()
    const visibleSections = useMemo(() => getVisibleSections(entries), [entries])
    const activeSection = getActiveSection(hash, visibleSections)
    const markdownStyleChanged = markdownStyleDraft.name !== markdownStyle
        || JSON.stringify(markdownStyleDraft.config) !== JSON.stringify(markdownStyleConfig)
    const markdownStyleValid = isMarkdownStyleConfig(markdownStyleDraft.config)

    useEffect(() => {
        if (draftDiscardTimeoutRef.current !== null) {
            window.clearTimeout(draftDiscardTimeoutRef.current)
            draftDiscardTimeoutRef.current = null
        }

        const currentDraft = configService.getDraft()
        if (!currentDraft) configService.loadDraft()
        return () => {
            // React StrictMode mounts, unmounts, and remounts effects; delay discard so the remount can cancel it.
            draftDiscardTimeoutRef.current = window.setTimeout(() => {
                configService.discardDraft()
                draftDiscardTimeoutRef.current = null
            }, DRAFT_DISCARD_DELAY_MS)
        }
    }, [])

    if (!draft) return null

    const handleValueChange = (key: ConfigKey, value: unknown) => {
        try {
            if (
                key === 'project.cardSeparator'
                && value !== draft[key]
                && value !== configService.get('project.cardSeparator')
            ) {
                dialogService.warning(
                    'Saving this change will rename existing card files and update their IDs.',
                    { critical: true, title: 'Card files will be renamed' },
                )
            }
            configService.setDraftValue(key, value)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Invalid config value' })
        }
    }

    const handleValidityChange = (key: ConfigKey, valid: boolean) => {
        setInvalidConfigKeys((currentKeys) => {
            if (valid && !currentKeys.has(key)) return currentKeys
            if (!valid && currentKeys.has(key)) return currentKeys

            const nextKeys = new Set(currentKeys)
            if (valid) nextKeys.delete(key)
            else nextKeys.add(key)

            return nextKeys
        })
    }

    const handleMarkdownStyleChange = (name: MarkdownStyleName, config: MarkdownStyleConfig) => {
        setMarkdownStyleDraft({ config, name })
    }

    const handleSaveClick = async () => {
        try {
            const shouldSaveProjectConfig = configService.hasDraftChangesForSource('project')
            const shouldSaveDesktopConfig = configService.hasDraftChangesForSource('desktop')
            const previousCardSeparator = configService.get('project.cardSeparator')
            const nextCardSeparator = draft['project.cardSeparator']
            const shouldUpdateCardSeparator = configService.hasProjectConfig()
                && previousCardSeparator !== nextCardSeparator
            if (shouldUpdateCardSeparator) {
                await dataService.projectLoading.updateCardSeparator(previousCardSeparator, nextCardSeparator)
            }
            configService.saveDraft()
            configService.loadDraft()
            if (markdownStyleChanged && markdownStyleDraft.name === 'custom') setCustomMarkdownStyle(markdownStyleDraft.config)
            else if (markdownStyleChanged && isMarkdownStylePresetName(markdownStyleDraft.name)) {
                setMarkdownStyle(markdownStyleDraft.name)
            }
            if (shouldSaveProjectConfig && configService.hasProjectConfig()) await dataService.projectLoading.saveProjectConfig()
            if (shouldSaveDesktopConfig && configService.hasDesktopConfig()) writeDesktopConfigToBridge(configService.getDesktopValues())
            dialogService.success('Config saved')
            navigateTo('/')
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Config save failed' })
        }
    }

    const handleCancelClick = () => {
        configService.discardDraft()
        navigateTo('/')
    }

    const sectionProps = {
        draft,
        entries,
        onChange: handleValueChange,
        onValidityChange: handleValidityChange,
    }

    const sectionTabs = (
        <Tabs
            aria-label="Config sections"
            orientation={isMobile ? 'horizontal' : 'vertical'}
            scrollButtons="auto"
            value={activeSection}
            variant="scrollable"
        >
            {visibleSections.map((section) => (
                <Tab component="a" href={`#/config/${section.id}`} key={section.id} label={section.label} value={section.id} />
            ))}
        </Tabs>
    )

    return (
        <Box
            aria-label="Config page"
            component="section"
            sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
            {!isMobile ? (
                <Box
                    aria-label="Config section navigation"
                    component="nav"
                    sx={{ borderRight: 1, borderColor: 'divider', flexShrink: 0, minHeight: 0, overflow: 'auto', width: CONFIG_SIDEBAR_WIDTH }}
                    tabIndex={0}
                >
                    {sectionTabs}
                </Box>
            ) : null}
            <Box
                aria-label="Config section content"
                role="region"
                sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto', p: CONFIG_PAGE_PADDING }}
                tabIndex={0}
            >
                <Stack spacing={3} sx={{ maxWidth: CONFIG_FORM_MAX_WIDTH }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
                        <Typography component="h2" sx={{ flexGrow: 1 }} variant="h5">
                            Config
                        </Typography>
                        <Button onClick={handleCancelClick} variant="outlined">
                            Cancel
                        </Button>
                        <Button disabled={invalidConfigKeys.size > 0 || !markdownStyleValid} onClick={handleSaveClick} variant="contained">
                            Save
                        </Button>
                    </Stack>

                    {isMobile ? sectionTabs : null}

                    {activeSection === 'react' ? <ReactConfigSection {...sectionProps} /> : null}
                    {activeSection === 'markdown' ? (
                        <MarkdownConfigSection
                            config={markdownStyleDraft.config}
                            name={markdownStyleDraft.name}
                            onChange={handleMarkdownStyleChange}
                        />
                    ) : null}
                    {activeSection === 'project' ? <ProjectConfigSection {...sectionProps} /> : null}
                    {activeSection === 'desktop' ? <DesktopConfigSection {...sectionProps} disabled={!configService.hasDesktopConfig()} /> : null}
                </Stack>
            </Box>
        </Box>
    )
}
