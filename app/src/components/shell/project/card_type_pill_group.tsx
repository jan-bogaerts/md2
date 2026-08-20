import { Box, ButtonBase } from '@mui/material'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { CardTypeConfig } from '../../../data/data_types'

interface CardTypePillGroupProps {
    cardTypes: CardTypeConfig[]
    isMobile: boolean
    onChange: (type: string) => void
    selectedType: string
}

/** Accessible single-select pills backed by configured project card types. */
export function CardTypePillGroup(props: CardTypePillGroupProps) {
    const { cardTypes, isMobile, onChange, selectedType } = props

    const handlePillClick = (event: MouseEvent<HTMLElement>) => {
        const type = event.currentTarget.dataset.cardType
        if (!type) throw new Error('Missing card type on type pill')

        onChange(type)
    }

    const handlePillKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        const type = event.currentTarget.dataset.cardType
        if (!type) throw new Error('Missing card type on type pill')

        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault()
            onChange(type)

            return
        }

        const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                ? -1
                : 0
        if (direction === 0) return

        event.preventDefault()
        const currentIndex = cardTypes.findIndex((typeConfig) => typeConfig.type === type)
        const nextIndex = (currentIndex + direction + cardTypes.length) % cardTypes.length
        const nextType = cardTypes[nextIndex]?.type
        if (!nextType) return

        const pills = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')
        const nextPill = pills?.[nextIndex]
        nextPill?.focus()
    }

    return (
        <Box
            aria-label="Type"
            role="radiogroup"
            sx={{
                display: 'flex',
                flexWrap: isMobile ? 'nowrap' : 'wrap',
                gap: 1,
                overflowX: isMobile ? 'auto' : 'visible',
                pb: isMobile ? 0.5 : 0,
                scrollbarWidth: 'none',
                '&::-webkit-scrollbar': { display: 'none' },
            }}
        >
            {cardTypes.map((typeConfig) => {
                const isSelected = typeConfig.type === selectedType

                return (
                    <ButtonBase
                        aria-checked={isSelected}
                        data-card-type={typeConfig.type}
                        key={typeConfig.type}
                        onClick={handlePillClick}
                        onKeyDown={handlePillKeyDown}
                        role="radio"
                        sx={{
                            bgcolor: isSelected ? 'custom.primaryBg' : 'custom.track',
                            border: 1,
                            flex: 1,
                            borderColor: isSelected ? 'primary.main' : 'transparent',
                            borderRadius: '99px',
                            color: isSelected ? 'primary.main' : 'text.secondary',
                            flexShrink: 0,
                            fontSize: 12.5,
                            fontWeight: 600,
                            gap: 0.875,
                            minHeight: isMobile ? 40 : 34,
                            px: 1.5,
                            '&:hover': {
                                borderColor: isSelected ? 'primary.main' : 'custom.borderHover',
                                color: isSelected ? 'primary.main' : 'text.primary',
                            },
                            '&:focus-visible': {
                                borderColor: 'primary.main',
                                boxShadow: (theme) => `0 0 0 3px ${theme.palette.custom.primaryBg}`,
                            },
                        }}
                        tabIndex={isSelected ? 0 : -1}
                    >
                        <Box
                            aria-hidden
                            sx={{
                                bgcolor: typeConfig.color.length > 0 ? typeConfig.color : 'custom.text4',
                                borderRadius: '50%',
                                height: 8,
                                width: 8,
                            }}
                        />
                        {typeConfig.label}
                    </ButtonBase>
                )
            })}
        </Box>
    )
}
