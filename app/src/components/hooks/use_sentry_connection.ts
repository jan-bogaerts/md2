import { useSyncExternalStore } from 'react'
import {
    sentryConnectionService,
    type SentryConnectionService,
    type SentryConnectionSnapshot,
} from '../../services/sentry/sentry_connection_service'

export function useSentryConnection(service: SentryConnectionService = sentryConnectionService): SentryConnectionSnapshot {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot(),
        () => service.getSnapshot(),
    )
}
