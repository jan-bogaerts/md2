import { Box, MenuItem, MenuList, Typography } from '@mui/material'
import type { MouseEvent } from 'react'
import type { StateConfig } from '../../data/data_types'
import { mobileCardViewService } from '../../services/project/mobile_card_view_service'
import { useCardViewColumns } from './use_card_view_columns'
import { useMobileCardViewColumn } from './use_mobile_card_view_column'

interface MobileCardViewMenuProps {
    onSelected: () => void
    states: StateConfig[]
}

/** Visible board-column choices for mobile hamburger drawer. */
export function MobileCardViewMenu(props: MobileCardViewMenuProps) {
    const { onSelected, states } = props
    const columns = useCardViewColumns(states)
    const selectedColumn = useMobileCardViewColumn(columns)

    const handleSelectColumn = (event: MouseEvent<HTMLLIElement>) => {
        const status = event.currentTarget.dataset.status
        if (status === undefined) throw new Error('Missing mobile card column status')

        mobileCardViewService.selectColumn(status)
        onSelected()
    }

    return (
        <Box aria-label="Board columns">
            <Typography sx={{ color: 'text.secondary', fontWeight: 600, px: 2, pb: 0.5, pt: 1.5 }} variant="body2">
                Board columns
            </Typography>
            <MenuList>
                {columns.map(({ color, status }) => (
                    <MenuItem
                        data-status={status}
                        key={status}
                        onClick={handleSelectColumn}
                        selected={selectedColumn?.status === status}
                    >
                        <Box sx={{ bgcolor: color, borderRadius: '3px', height: 8, mr: 1, width: 8 }} />
                        {status || 'Unassigned'}
                    </MenuItem>
                ))}
            </MenuList>
        </Box>
    )
}
