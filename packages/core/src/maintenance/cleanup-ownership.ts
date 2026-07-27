/**
 * Modules allowed to apply the canonical protected-data cleanup decision.
 * Adding a consumer requires architecture review and an explicit registry update.
 */
export const PROTECTED_CLEANUP_CONSUMERS = [
  "api/routes/audit.ts",
  "artifacts/lifecycle.ts",
  "runs/soak-retention.ts",
  "runs/store.ts",
] as const
