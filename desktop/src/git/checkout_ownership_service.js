const path = require('node:path');
const { currentGitOperationContext } = require('./git_operation_context');

/** Owns checkout leases across runs, waits, and Git transitions. */
class CheckoutOwnershipService {
    constructor() {
        this.claims = new Map();
    }

    static key(rootPath) {
        const normalized = path.resolve(rootPath);

        return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    }

    acquire(rootPath, ownerId, exclusive) {
        const key = CheckoutOwnershipService.key(rootPath);
        const claims = this.claims.get(key) ?? [];
        if (claims.some((claim) => claim.ownerId !== ownerId && (exclusive || claim.exclusive))) {
            throw new Error(`Checkout is owned by another run: ${rootPath}`);
        }
        const claim = { branches: new Set(), exclusive, ownerId };
        this.claims.set(key, [...claims, claim]);

        return () => {
            const remaining = this.claims.get(key)?.filter((candidate) => candidate !== claim) ?? [];
            if (remaining.length > 0) this.claims.set(key, remaining);
            else this.claims.delete(key);
        };
    }

    reserveBranches(rootPath, ownerId, branches) {
        const claims = this.claims.get(CheckoutOwnershipService.key(rootPath)) ?? [];
        const claim = claims.find((candidate) => candidate.ownerId === ownerId && candidate.exclusive);
        if (!claim) throw new Error('Missing sequence checkout lease');
        claim.branches = new Set(branches);
    }

    assertBranchAvailable(branch, ownerId = currentGitOperationContext().checkoutOwnerId) {
        for (const claims of this.claims.values()) {
            if (claims.some((claim) => claim.ownerId !== ownerId && claim.branches.has(branch))) {
                throw new Error(`Branch is owned by a sequence: ${branch}`);
            }
        }
    }

    assertAvailable(rootPath, ownerId = currentGitOperationContext().checkoutOwnerId) {
        const claims = this.claims.get(CheckoutOwnershipService.key(rootPath)) ?? [];
        if (claims.some((claim) => claim.exclusive && claim.ownerId !== ownerId)) {
            throw new Error(`Checkout is owned by a sequence: ${rootPath}`);
        }
    }
}

const checkoutOwnershipService = new CheckoutOwnershipService();

module.exports = { CheckoutOwnershipService, checkoutOwnershipService };
