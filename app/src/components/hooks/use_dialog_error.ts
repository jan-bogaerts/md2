import { useEffect, useRef } from 'react'
import { dialogService } from '../../services/dialog_service'

function errorIdentity(error: unknown, fallbackMessage: string) {
    if (error instanceof Error && error.message.length > 0) return error.message
    if (typeof error === 'string' && error.length > 0) return error

    return fallbackMessage
}

/** Report a render-detected error once until the condition clears. */
export function useDialogError(error: unknown | null, fallbackMessage: string) {
    const reportedIdentityRef = useRef<string | null>(null)

    useEffect(() => {
        if (error === null) {
            reportedIdentityRef.current = null
            return
        }

        const identity = errorIdentity(error, fallbackMessage)
        if (reportedIdentityRef.current === identity) return

        reportedIdentityRef.current = identity
        dialogService.error(error, { fallbackMessage })
    }, [error, fallbackMessage])
}
