import { describe, expect, it } from 'vitest';
import { subscriptionCostPerPercentagePoint } from './stats_subscription_cost';

describe('subscriptionCostPerPercentagePoint', () => {
    it('allocates a monthly price across four weekly limit windows', () => {
        expect(subscriptionCostPerPercentagePoint(20, 10_080)).toBeCloseTo(0.05, 10);
    });

    it('uses the reported duration for shorter limit windows', () => {
        expect(subscriptionCostPerPercentagePoint(20, 300)).toBeCloseTo(20 / 13_440, 10);
    });
});
