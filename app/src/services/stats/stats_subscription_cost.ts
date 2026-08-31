const SUBSCRIPTION_MONTH_DAYS = 28;
const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;
const PERCENTAGE_POINTS_PER_WINDOW = 100;
const SUBSCRIPTION_MONTH_MINUTES = SUBSCRIPTION_MONTH_DAYS * HOURS_PER_DAY * MINUTES_PER_HOUR;

/** Allocate a monthly subscription price across every limit window in a fixed 28-day month. */
export function subscriptionCostPerPercentagePoint(monthlySubscriptionCostUsd: number, windowDurationMinutes: number) {
    const windowsPerSubscriptionMonth = SUBSCRIPTION_MONTH_MINUTES / windowDurationMinutes;

    return monthlySubscriptionCostUsd / (PERCENTAGE_POINTS_PER_WINDOW * windowsPerSubscriptionMonth);
}
