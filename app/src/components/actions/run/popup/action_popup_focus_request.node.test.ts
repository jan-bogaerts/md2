import { describe, expect, it } from 'vitest';
import { ActionPopupFocusRequest } from './action_popup_focus_request';

describe('ActionPopupFocusRequest', () => {
    it('is consumed exactly once', () => {
        const focusRequest = new ActionPopupFocusRequest();

        expect(focusRequest.consume()).toBe(true);
        expect(focusRequest.consume()).toBe(false);
    });
});
