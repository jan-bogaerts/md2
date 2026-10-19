/** One-shot request to apply the after-select focus rule for one action selection. */
export class ActionPopupFocusRequest {
    private pending = true;

    /** Returns true for the first call only; later calls return false. */
    consume() {
        const wasPending = this.pending;
        this.pending = false;

        return wasPending;
    }
}
