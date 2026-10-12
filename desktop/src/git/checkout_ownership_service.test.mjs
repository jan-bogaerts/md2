import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { CheckoutOwnershipService } = require('./checkout_ownership_service');
const { runWithGitOperationContext } = require('./git_operation_context');

describe('CheckoutOwnershipService', () => {
    it('rejects sequence acquisition during an ordinary run and releases after completion', () => {
        const ownership = new CheckoutOwnershipService();
        const release = ownership.acquire('C:/checkout', 'run-1', false);
        expect(() => ownership.acquire('C:/checkout', 'sequence-1', true)).toThrow('owned by another run');
        release();
        const releaseSequence = ownership.acquire('C:/checkout', 'sequence-1', true);
        expect(() => ownership.acquire('C:/checkout', 'run-2', false)).toThrow('owned by another run');
        releaseSequence();
        expect(() => ownership.assertAvailable('C:/checkout')).not.toThrow();
    });

    it('allows owner phases and separate checkouts while rejecting UI mutations', () => {
        const ownership = new CheckoutOwnershipService();
        const release = ownership.acquire('C:/checkout', 'sequence-1', true);
        expect(() => ownership.assertAvailable('C:/checkout')).toThrow('owned by a sequence');
        expect(() => ownership.assertAvailable('C:/other')).not.toThrow();
        runWithGitOperationContext({ checkoutOwnerId: 'sequence-1' }, () => ownership.assertAvailable('C:/checkout'));
        const releaseRun = ownership.acquire('C:/checkout', 'sequence-1', false);
        releaseRun();
        expect(() => ownership.assertAvailable('C:/checkout')).toThrow('owned by a sequence');
        release();
    });
});
