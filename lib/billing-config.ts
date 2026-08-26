export type BillingPlan =
  | "free"
  | "starter"
  | "pro"
  | "unlimited"
  | "legacy_unlimited";

export type PaidBillingPlan =
  | "starter"
  | "pro"
  | "unlimited"
  | "legacy_unlimited";

export type BillingAction = "deep_reverse" | "manual_control";
export type BillingWindow = "month" | "day" | null;

export type BillingFeatureStatus = {
  limit: number | null;
  remaining: number | null;
  window: BillingWindow;
  canUse: boolean;
};

export type BillingCreditsStatus = {
  balance: number;
};

export type BillingStatus = {
  subscribed: boolean;
  plan: BillingPlan;
  priceId: string | null;
  isLegacy: boolean;
  nextPlan: "starter" | "pro" | "unlimited" | null;
  credits: BillingCreditsStatus;
  deepReverse: BillingFeatureStatus;
  manualControl: BillingFeatureStatus;
};

export const STRIPE_PRICE_IDS = {
  legacyUnlimited: "price_1TQj8FIBG5KwEK8atVJ49Oq9",
  starter: "price_1TfvMRIBG5KwEK8aVwcI83zp",
  pro: "price_1TfvMRIBG5KwEK8aYeCaGRML",
  unlimited: "price_1TfvMRIBG5KwEK8a5aETT5X8",
  credit: "price_1Tq9A8IBG5KwEK8aYIUW1fVp",
  partner: "price_1TwJ0DIBG5KwEK8ap7Eat9rn",
  readmeSponsor: "price_1U6QY1IBG5KwEK8aeyr0kLAa",
} as const;

export const STRIPE_PAYMENT_LINKS = {
  readmeSponsor: "https://buy.stripe.com/dRmdRaaGu3es6Dz5sgg7e03",
} as const;

/** Hardcoded in reconcile_user_credits migration SQL — keep in sync. */
export const CREDIT_STRIPE_PRICE_ID = STRIPE_PRICE_IDS.credit;

export const FREE_MANUAL_LIMIT = 0;
export const STARTER_LIMIT = 5;
export const PRO_LIMIT = 5;

export const PLAN_RANK: Record<BillingPlan, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  unlimited: 3,
  legacy_unlimited: 4,
};

export function isPaidPlan(plan: BillingPlan): plan is PaidBillingPlan {
  return plan !== "free";
}

export function getNextPlan(
  plan: BillingPlan
): "starter" | "pro" | "unlimited" | null {
  return plan === "free" ? "starter" : null;
}

export function canUpgradeToPlan(
  currentPlan: BillingPlan,
  targetPlan: Extract<BillingPlan, "starter" | "pro" | "unlimited">
): boolean {
  return currentPlan === "free" && targetPlan === "starter";
}

export function getPlanLabel(plan: BillingPlan): string {
  switch (plan) {
    case "starter":
      return "Premium";
    case "pro":
      return "Premium";
    case "unlimited":
      return "Premium";
    case "legacy_unlimited":
      return "Premium";
    default:
      return "Free";
  }
}

function featureForPlan(
  plan: BillingPlan,
  creditBalance = 0
): BillingFeatureStatus {
  if (creditBalance >= 1) {
    return {
      limit: null,
      remaining: creditBalance,
      window: null,
      canUse: true,
    };
  }

  if (plan === "free") {
    return {
      limit: 0,
      remaining: 0,
      window: "month",
      canUse: false,
    };
  }

  if (plan === "starter") {
    return {
      limit: STARTER_LIMIT,
      remaining: STARTER_LIMIT,
      window: "month",
      canUse: true,
    };
  }

  if (
    plan === "pro" ||
    plan === "unlimited" ||
    plan === "legacy_unlimited"
  ) {
    return {
      limit: STARTER_LIMIT,
      remaining: STARTER_LIMIT,
      window: "month",
      canUse: true,
    };
  }

  return {
    limit: STARTER_LIMIT,
    remaining: STARTER_LIMIT,
    window: "month",
    canUse: true,
  };
}

export function buildDefaultBillingStatus(
  plan: BillingPlan = "free",
  creditBalance = 0
): BillingStatus {
  return {
    subscribed: isPaidPlan(plan),
    plan,
    priceId:
      plan === "legacy_unlimited"
        ? STRIPE_PRICE_IDS.legacyUnlimited
        : plan === "starter"
          ? STRIPE_PRICE_IDS.starter
          : plan === "pro"
            ? STRIPE_PRICE_IDS.pro
            : plan === "unlimited"
              ? STRIPE_PRICE_IDS.unlimited
              : null,
    isLegacy: plan === "legacy_unlimited",
    nextPlan: getNextPlan(plan),
    credits: { balance: creditBalance },
    deepReverse: featureForPlan(plan, creditBalance),
    manualControl: featureForPlan(plan, creditBalance),
  };
}

function normalizePlan(value: unknown): BillingPlan {
  return value === "starter" ||
    value === "pro" ||
    value === "unlimited" ||
    value === "legacy_unlimited"
    ? value
    : "free";
}

function coerceFeatureStatus(
  value: unknown,
  fallback: BillingFeatureStatus
): BillingFeatureStatus {
  if (!value || typeof value !== "object") return fallback;
  const v = value as Record<string, unknown>;
  const limit = typeof v.limit === "number" ? v.limit : fallback.limit;
  const remaining =
    typeof v.remaining === "number" || v.remaining === null
      ? (v.remaining as number | null)
      : fallback.remaining;
  const window =
    v.window === "month" || v.window === "day" || v.window === null
      ? (v.window as BillingWindow)
      : fallback.window;
  const canUse =
    typeof v.canUse === "boolean" ? v.canUse : fallback.canUse;
  return { limit, remaining, window, canUse };
}

export function coerceBillingStatus(value: unknown): BillingStatus {
  if (!value || typeof value !== "object") {
    return buildDefaultBillingStatus();
  }

  const raw = value as Record<string, unknown>;
  const plan = normalizePlan(raw.plan);
  const fallbackCredits =
    raw.credits &&
    typeof raw.credits === "object" &&
    typeof (raw.credits as Record<string, unknown>).balance === "number"
      ? ((raw.credits as Record<string, unknown>).balance as number)
      : 0;
  const fallback = buildDefaultBillingStatus(plan, fallbackCredits);

  const creditsRaw = raw.credits;
  const creditsBalance =
    creditsRaw &&
    typeof creditsRaw === "object" &&
    typeof (creditsRaw as Record<string, unknown>).balance === "number"
      ? ((creditsRaw as Record<string, unknown>).balance as number)
      : fallback.credits.balance;

  return {
    subscribed:
      typeof raw.subscribed === "boolean" ? raw.subscribed : fallback.subscribed,
    plan,
    priceId: typeof raw.priceId === "string" ? raw.priceId : fallback.priceId,
    isLegacy:
      typeof raw.isLegacy === "boolean" ? raw.isLegacy : fallback.isLegacy,
    nextPlan:
      raw.nextPlan === "starter" ||
      raw.nextPlan === "pro" ||
      raw.nextPlan === "unlimited" ||
      raw.nextPlan === null
        ? (raw.nextPlan as BillingStatus["nextPlan"])
        : fallback.nextPlan,
    credits: { balance: creditsBalance },
    deepReverse: coerceFeatureStatus(raw.deepReverse, fallback.deepReverse),
    manualControl: coerceFeatureStatus(
      raw.manualControl,
      fallback.manualControl
    ),
  };
}
