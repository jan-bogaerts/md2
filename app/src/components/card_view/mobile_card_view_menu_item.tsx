import { Box, MenuItem } from '@mui/material'
import { mobileCardViewService } from '../../services/project/mobile_card_view_service'
import { useCardColumnCards } from './use_card_column_cards'
import type { VisibleCardColumn } from './use_card_view_columns'

interface MobileCardViewMenuItemProps {
    column: VisibleCardColumn
    onSelected: () => void
    selected: boolean
}

/** One mobile board-column choice with its live active-card count. */
export function MobileCardViewMenuItem(props: MobileCardViewMenuItemProps) {
    const { column, onSelected, selected } = props
    const cardPaths = useCardColumnCards(column.status)
    const handleSelectColumn = () => {
        mobileCardViewService.selectColumn(column.status)
        onSelected()
    }

    return (
        <MenuItem onClick={handleSelectColumn} selected={selected}>
            <Box sx={{ bgcolor: column.color, borderRadius: '3px', height: 8, mr: 1, width: 8 }} />
            {column.status || 'Unassigned'}
            <Box sx={{ flex: 1 }} />
            {cardPaths.length}
        </MenuItem>
    )
}
