import { Box, MenuList, Typography } from '@mui/material'
import type { StateConfig } from '../../data/data_types'
import { MobileCardViewMenuItem } from './mobile_card_view_menu_item'
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

    return (
        <Box aria-label="Board columns">
            <Typography sx={{ color: 'text.secondary', fontWeight: 600, px: 2, pb: 0.5, pt: 1.5 }} variant="body2">
                Board columns
            </Typography>
            <MenuList>
                {columns.map((column) => (
                    <MobileCardViewMenuItem
                        column={column}
                        key={column.status}
                        onSelected={onSelected}
                        selected={selectedColumn?.status === column.status}
                    />
                ))}
            </MenuList>
        </Box>
    )
}
