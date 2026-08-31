import {
    Box, InputBase, MenuItem, Select, Typography,
    type SelectChangeEvent,
} from '@mui/material'
import DriveFileMoveOutlined from '@mui/icons-material/DriveFileMoveOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import DifferenceOutlined from '@mui/icons-material/DifferenceOutlined'
import LabelOutlined from '@mui/icons-material/LabelOutlined'
import PolicyOutlined from '@mui/icons-material/PolicyOutlined'
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined'
import TitleOutlined from '@mui/icons-material/TitleOutlined'
import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { getCardType } from '../../data/action_context'
import { defaultColumnAccent, type CardTypeConfig } from '../../data/data_types'
import { cardMarkdownDataSource, type CardBinding, type CardMarkdownDataSource } from '../editor/card_markdown_data_source'
import { useActiveCard } from '../hooks/use_active_card'

const AUTO_MERGE_POLICY_KEY = 'autoMerge'
const MANUAL_POLICY_VALUE = 'manual'
const AUTO_MERGE_POLICY_VALUE = 'autoMerge'

interface PropertyDraft {
    baseline: string
    documentId: string | null
    value: string
}

interface CardPropertiesPanelProps {
    binding: CardBinding
    cardTypes: CardTypeConfig[]
    dataSource?: CardMarkdownDataSource
    statusColors: Map<string, string>
}

const rowSx = {
    alignItems: 'center',
    borderRadius: '6px',
    display: 'flex',
    gap: '10px',
    height: 36,
    px: '6px',
    '&:hover': { bgcolor: 'custom.track' },
}

const labelSx = {
    alignItems: 'center',
    color: 'custom.text3',
    display: 'flex',
    flexShrink: 0,
    fontSize: '12.5px',
    gap: '6px',
    width: 82,
}

const inputSx = {
    bgcolor: 'transparent',
    border: '1px solid transparent',
    borderRadius: '7px',
    flex: 1,
    height: 32,
    minWidth: 0,
    px: 1,
    '&:hover': { bgcolor: 'background.paper', borderColor: 'divider' },
    '&.Mui-focused': {
        bgcolor: 'background.paper',
        borderColor: 'primary.main',
        boxShadow: (theme: { palette: { custom: { primaryBg: string } } }) => `0 0 0 3px ${theme.palette.custom.primaryBg}`,
    },
}

/** Compact editor for user-facing card properties inside the toolbar popup. */
export function CardPropertiesPanel(props: CardPropertiesPanelProps) {
    const { binding, cardTypes, dataSource = cardMarkdownDataSource, statusColors } = props
    const card = useActiveCard(binding, dataSource)
    const documentId = card?.header.internalId ?? null
    const author = card?.header.author ?? null
    const title = card?.header.title ?? ''
    const authorValue = author ?? ''
    const [authorEdit, setAuthorEdit] = useState<PropertyDraft>({ baseline: authorValue, documentId, value: authorValue })
    const [titleEdit, setTitleEdit] = useState<PropertyDraft>({ baseline: title, documentId, value: title })
    const authorDraft = authorEdit.documentId === documentId && authorEdit.baseline === authorValue
        ? authorEdit.value
        : authorValue
    const titleDraft = titleEdit.documentId === documentId && titleEdit.baseline === title ? titleEdit.value : title
    const autoMergeEnabled = card?.header.policy[AUTO_MERGE_POLICY_KEY] ?? false
    const policyValue = autoMergeEnabled ? AUTO_MERGE_POLICY_VALUE : MANUAL_POLICY_VALUE
    const affects = card?.header.affects ?? []
    const affectsValue = affects.length > 0 ? affects.join(', ') : 'None'
    const changedFiles = card?.header.changedFiles ?? []
    const changedFilesValue = changedFiles.length > 0 ? changedFiles.join(', ') : 'None'
    const statusValue = card?.header.status ?? 'None'
    const statusColor = card?.header.status
        ? statusColors.get(card.header.status) ?? defaultColumnAccent(0)
        : undefined
    const typeValue = card ? getCardType(cardTypes, card.header.id) ?? '' : ''

    const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setTitleEdit({ baseline: title, documentId, value: event.target.value })
    }

    const commitTitle = () => {
        const nextTitle = titleDraft.trim()
        if (nextTitle.length === 0) {
            setTitleEdit({ baseline: title, documentId, value: title })
            return
        }
        if (nextTitle !== title) dataSource.updateActiveCardTitle(binding, nextTitle)
    }

    const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
            setTitleEdit({ baseline: title, documentId, value: title })
            event.currentTarget.blur()
        }
    }

    const handleAuthorChange = (event: ChangeEvent<HTMLInputElement>) => {
        setAuthorEdit({ baseline: authorValue, documentId, value: event.target.value })
    }

    const commitAuthor = () => {
        if (authorDraft !== (author ?? '')) {
            dataSource.updateActiveCardHeaderField(binding, 'author', authorDraft)
        }
    }

    const handleAuthorKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
            setAuthorEdit({ baseline: authorValue, documentId, value: authorValue })
            event.currentTarget.blur()
        }
    }

    const handlePolicyChange = (event: SelectChangeEvent) => {
        const shouldAutoMerge = event.target.value === AUTO_MERGE_POLICY_VALUE
        if (shouldAutoMerge !== autoMergeEnabled) dataSource.toggleActiveCardPolicy(binding, AUTO_MERGE_POLICY_KEY)
    }

    const handleTypeChange = (event: SelectChangeEvent) => {
        const nextType = event.target.value
        if (nextType !== typeValue) void dataSource.updateActiveCardType(binding, nextType)
    }

    if (!card) return null

    return (
        <Box
            aria-label="Card properties"
            sx={{maxWidth: 720, width: '100%'}}
        >
            <Box
                sx={{
                    alignItems: 'center', borderBottom: '1px solid', borderColor: 'divider',
                    display: 'flex', mb: 1.25, minHeight: 32, pb: 1.25, px: 0.75,
                }}
            >
                <Typography
                    component="h2"
                    sx={{ color: 'custom.colHead', fontSize: 11, fontWeight: 700, letterSpacing: '0.7px', lineHeight: 1 }}
                    variant="overline"
                >
                    Properties
                </Typography>
                <Box sx={{ flex: 1 }} />
                <Box
                    component="span"
                    sx={{
                        bgcolor: 'custom.primaryBg', borderRadius: '4px', color: 'primary.main',
                        fontFamily: 'monospace', fontSize: 11, fontWeight: 600, px: 0.75, py: 0.25,
                    }}
                >
                    {card.header.id}
                </Box>
            </Box>
            <Box sx={{ columnGap: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: '2px' }}>
                <Box sx={{ ...rowSx, gridColumn: '1 / -1', height: 40 }}>
                    <Box sx={labelSx}><TitleOutlined sx={{ fontSize: 14 }} />Title</Box>
                    <InputBase
                        fullWidth
                        inputProps={{ 'aria-label': 'Card title' }}
                        onBlur={commitTitle}
                        onChange={handleTitleChange}
                        onKeyDown={handleTitleKeyDown}
                        sx={{ ...inputSx, '& input': { fontSize: 14, fontWeight: 600, p: 0 } }}
                        value={titleDraft}
                    />
                </Box>
                <Box sx={rowSx}>
                    <Box sx={labelSx}><ScheduleOutlined sx={{ fontSize: 14 }} />Status</Box>
                    <Box
                        sx={{
                            alignItems: 'center', bgcolor: 'custom.track', border: '1px solid', borderColor: 'divider',
                            borderRadius: 99, color: 'text.secondary', display: 'inline-flex', fontSize: 12,
                            fontWeight: 600, gap: 0.75, height: 22, px: '10px',
                        }}
                    >
                        <Box sx={{ bgcolor: statusColor ?? 'custom.text4', borderRadius: '50%', height: 7, width: 7 }} />
                        {statusValue}
                    </Box>
                </Box>
                <Box sx={rowSx}>
                    <Box sx={labelSx}><LabelOutlined sx={{ fontSize: 14 }} />Type</Box>
                    <Select
                        aria-label="Card type"
                        onChange={handleTypeChange}
                        size="small"
                        sx={{
                            bgcolor: 'custom.track', borderRadius: '7px', color: 'text.secondary', fontSize: '12.5px',
                            fontWeight: 500, height: 24,
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'custom.borderHover' },
                            '& .MuiSelect-select': { py: 0, pl: '10px', pr: '26px' },
                            '& .MuiSelect-icon': { color: 'custom.text4', fontSize: 17 },
                        }}
                        value={typeValue}
                    >
                        {typeValue.length === 0 ? <MenuItem disabled value="">Unknown</MenuItem> : null}
                        {cardTypes.map(({ label, type }) => <MenuItem key={type} value={type}>{label}</MenuItem>)}
                    </Select>
                </Box>
                <Box sx={{ ...rowSx, height: 40 }}>
                    <Box sx={labelSx}><EditOutlined sx={{ fontSize: 14 }} />Author</Box>
                    <InputBase
                        fullWidth
                        inputProps={{ 'aria-label': 'Card author' }}
                        onBlur={commitAuthor}
                        onChange={handleAuthorChange}
                        onKeyDown={handleAuthorKeyDown}
                        sx={{ ...inputSx, '& input': { fontSize: 13, p: 0 } }}
                        value={authorDraft}
                    />
                </Box>
                <Box sx={rowSx}>
                    <Box sx={labelSx}><DriveFileMoveOutlined sx={{ fontSize: 14 }} />Affects</Box>
                    <Typography
                        noWrap
                        sx={{ color: affects.length > 0 ? 'text.primary' : 'custom.text4', fontSize: 13, minWidth: 0 }}
                        title={affectsValue}
                    >
                        {affectsValue}
                    </Typography>
                </Box>
                <Box sx={rowSx}>
                    <Box sx={labelSx}><PolicyOutlined sx={{ fontSize: 14 }} />Policy</Box>
                    <Select
                        aria-label="Card policy"
                        onChange={handlePolicyChange}
                        size="small"
                        sx={{
                            bgcolor: 'custom.track', borderRadius: '7px', color: 'text.secondary', fontSize: '12.5px',
                            fontWeight: 500, height: 24,
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'custom.borderHover' },
                            '& .MuiSelect-select': { py: 0, pl: '10px', pr: '26px' },
                            '& .MuiSelect-icon': { color: 'custom.text4', fontSize: 17 },
                        }}
                        value={policyValue}
                    >
                        <MenuItem value={MANUAL_POLICY_VALUE}>Manual</MenuItem>
                        <MenuItem value={AUTO_MERGE_POLICY_VALUE}>Auto-merge</MenuItem>
                    </Select>
                </Box>
                <Box sx={{ ...rowSx, gridColumn: '1 / -1' }}>
                    <Box sx={{ ...labelSx, width: 104 }}><DifferenceOutlined sx={{ fontSize: 14 }} />Changed files</Box>
                    <Typography
                        noWrap
                        sx={{ color: changedFiles.length > 0 ? 'text.primary' : 'custom.text4', fontSize: 13, minWidth: 0 }}
                        title={changedFilesValue}
                    >
                        {changedFilesValue}
                    </Typography>
                </Box>
            </Box>
        </Box>
    )
}
