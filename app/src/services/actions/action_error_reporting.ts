import { MISSING_THIS_CARD_CONTEXT_ERROR } from '../../../../shared/action_errors.mjs'
import { dialogService, type DialogServiceOptions } from '../dialog_service'

type CodedError = object & { code?: unknown }

/** True for the expected project-context use of the card-only placeholder. */
export function isMissingThisCardContextError(error: unknown) {
    return typeof error === 'object'
        && error !== null
        && (error as CodedError).code === MISSING_THIS_CARD_CONTEXT_ERROR
}

/** Shows expected action configuration errors without telemetry and reports all other action errors. */
export function reportActionError(error: unknown, options: DialogServiceOptions = {}) {
    if (isMissingThisCardContextError(error) && error instanceof Error) {
        dialogService.displayError(error.message, options)
        return
    }

    dialogService.error(error, options)
}
