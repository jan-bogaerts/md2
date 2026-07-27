import { useSyncExternalStore } from 'react'
import {
    applicationStartupService,
    type ApplicationStartupService,
} from '../services/application_startup_service'

/** Subscribe to application startup state without starting service work from React. */
export function useAppBootstrap(service: ApplicationStartupService = applicationStartupService) {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot(),
        () => service.getSnapshot(),
    )
}
