import { Box, MenuItem, Select, Typography } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import type { StateConfig } from '../../data/data_types'
import { statusOf } from '../../data/card_ordering'
import { dataService } from '../../services/data/data_service'
import { dialogService } from '../../services/dialog_service'

const CARD_STATE_SELECT_MIN_WIDTH = 160
const STATE_DOT_SIZE = 8

interface CardStateSelectorProps {
    cardPath: string
    currentState: string | null
    disabled: boolean
    states: StateConfig[]
    statusColors: Map<string, string>
}

/** Changes an active card state through the existing ordered-card move operation. */
export function CardStateSelector(props: CardStateSelectorProps) {
    const { cardPath, currentState, disabled, states, statusColors } = props

    const handleStateChange = async (event: SelectChangeEvent<string>) => {
        const targetState = event.target.value

        try {
            const activeCards = dataService.getState().snapshot?.activeCards ?? []
            const activeCard = activeCards.find((card) => card.path === cardPath)
            if (!activeCard) throw new Error(`Cannot move an active card that is not loaded: ${cardPath}`)
            if (targetState === activeCard.header.status) return

            const targetIndex = activeCards.filter((card) => statusOf(card) === targetState).length
            await dataService.cards.moveCard(cardPath, targetState, targetIndex)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: `Card move failed: ${cardPath}` })
        }
    }

    const stateValue = currentState ?? ''

    return (
        <Box data-card-state-selector="true" sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0, gap: 0.5 }}>
            <Select
                disabled={disabled}
                inputProps={{ 'aria-label': 'Card state' }}
                onChange={handleStateChange}
                renderValue={(state) => (
                    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                        <Box sx={{ backgroundColor: statusColors.get(state), borderRadius: '50%', height: STATE_DOT_SIZE, width: STATE_DOT_SIZE }} />
                        {state}
                    </Box>
                )}
                size="small"
                sx={{ minWidth: CARD_STATE_SELECT_MIN_WIDTH }}
                value={stateValue}
            >
                {states.map(({ state }) => (
                    <MenuItem key={state} value={state}>
                        <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                            <Box sx={{ backgroundColor: statusColors.get(state), borderRadius: '50%', height: STATE_DOT_SIZE, width: STATE_DOT_SIZE }} />
                            {state}
                        </Box>
                    </MenuItem>
                ))}
            </Select>
        </Box>
    )
}
