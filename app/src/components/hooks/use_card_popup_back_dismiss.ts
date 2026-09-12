import { useMediaQuery, useTheme } from '@mui/material'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { isElectron } from '../../services/electron_lifecycle_bridge'
import { cardPopupService, subscribeCardPopups } from '../../services/card_popup_service'
import { mobileBackDismissService, type MobileBackDismissService } from '../../services/mobile_back_dismiss_service'

const REGISTRATION_ID_PREFIX = 'card-popup-back-dismiss'

function closeTopCardPopup() {
    const topEntry = cardPopupService.getSnapshot().at(-1)
    if (!topEntry) return

    cardPopupService.close(topEntry.id)
}

/**
 * Keeps one back-dismiss registration per open card popup while those popups are full screen,
 * so one back press closes the top popup and repeated presses walk down the stack.
 */
export function useCardPopupBackDismiss(service: MobileBackDismissService = mobileBackDismissService) {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const entries = useSyncExternalStore(
        subscribeCardPopups,
        () => cardPopupService.getSnapshot(),
        () => cardPopupService.getSnapshot(),
    )
    const registeredIdsRef = useRef<string[]>([])
    const nextRegistrationIdRef = useRef(1)
    const serviceRef = useRef(service)
    const isActive = isMobile && !isElectron()
    const requiredRegistrations = isActive ? entries.length : 0

    useEffect(() => {
        serviceRef.current = service
    })

    useEffect(() => {
        const registeredIds = registeredIdsRef.current
        while (registeredIds.length > requiredRegistrations) {
            service.unregister(registeredIds.pop() as string)
        }
        while (registeredIds.length < requiredRegistrations) {
            const registrationId = `${REGISTRATION_ID_PREFIX}-${nextRegistrationIdRef.current}`
            nextRegistrationIdRef.current += 1
            registeredIds.push(registrationId)
            service.register(registrationId, closeTopCardPopup)
        }
    }, [requiredRegistrations, service])

    useEffect(() => () => {
        const registeredIds = registeredIdsRef.current
        while (registeredIds.length > 0) {
            serviceRef.current.unregister(registeredIds.pop() as string)
        }
    }, [])
}
