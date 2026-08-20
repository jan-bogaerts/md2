import { useSyncExternalStore } from 'react'
import {
    sentryImportService,
    type SentryImportService,
    type SentryImportSnapshot,
} from '../../services/sentry/sentry_import_service'

export function useSentryImport(service: SentryImportService = sentryImportService): SentryImportSnapshot {
    return useSyncExternalStore(
        (onStoreChange) => {
            service.addEventListener('changed', onStoreChange)

            return () => service.removeEventListener('changed', onStoreChange)
        },
        () => service.getSnapshot(),
        () => service.getSnapshot(),
    )
}
