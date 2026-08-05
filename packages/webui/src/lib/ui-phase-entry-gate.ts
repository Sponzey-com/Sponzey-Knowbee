export type CompatibilityLifecycle = "redirect" | "compatibility" | "remove_candidate"
export type CompatibilityAccess = "user" | "internal" | "restricted"

export interface CompatibilityRouteLifecycle {
  routeId: string
  from: string
  replacement: string | null
  lifecycle: CompatibilityLifecycle
  access: CompatibilityAccess
  queryIntent: "preserve" | "drop_with_reason"
  minimumRedirectVersions: number
  telemetryEvidence: "not_collected" | "usage_observed" | "no_usage_observed"
  functionalParity: "unverified" | "verified"
  deepLinkVerification: "unverified" | "verified"
}

export type CompatibilityRouteDiagnostic = {
  routeId: string
  reasonCode:
    | "compatibility_replacement_missing"
    | "compatibility_redirect_cycle"
    | "compatibility_route_duplicated"
    | "compatibility_grace_period_missing"
    | "removal_telemetry_missing"
    | "removal_functional_parity_missing"
    | "removal_deep_link_verification_missing"
}

function route(
  from: string,
  replacement: string,
  access: CompatibilityAccess = "internal",
): CompatibilityRouteLifecycle {
  return {
    routeId: `legacy:${from}`,
    from,
    replacement,
    lifecycle: "redirect",
    access,
    queryIntent: "preserve",
    minimumRedirectVersions: 1,
    telemetryEvidence: "not_collected",
    functionalParity: "unverified",
    deepLinkVerification: "unverified",
  }
}

export const CURRENT_COMPATIBILITY_ROUTE_BASELINE: readonly CompatibilityRouteLifecycle[] = [
  route("/runs", "/work/runs"),
  route("/dashboard", "/status"),
  route("/audit", "/status", "restricted"),
  route("/schedules", "/work/schedules"),
  route("/plugins", "/status"),
  route("/settings", "/setup"),
  route("/ai", "/setup"),
  route("/channels", "/setup"),
  route("/extensions", "/setup"),
  route("/memory", "/setup"),
  route("/tools", "/setup"),
  route("/release", "/setup"),
  route("/advanced/topology", "/sub-agents"),
  route("/advanced/enterprise-topology", "/sub-agents"),
  route("/topology", "/sub-agents"),
  route("/enterprise-topology", "/sub-agents"),
  route("/advanced/orchestration", "/sub-agents"),
  route("/advanced/settings", "/setup"),
  route("/advanced/ai", "/setup"),
  route("/advanced/channels", "/setup"),
  route("/advanced/extensions", "/setup"),
  route("/advanced/memory", "/setup"),
  route("/advanced/tools", "/setup"),
  route("/advanced/release", "/setup"),
  route("/advanced/runs", "/work/runs"),
  route("/advanced/dashboard", "/status"),
  route("/advanced/audit", "/status", "restricted"),
  route("/advanced/plugins", "/status"),
  route("/advanced/schedules", "/work/schedules"),
] as const

function participatesInCycle(
  start: CompatibilityRouteLifecycle,
  bySource: ReadonlyMap<string, CompatibilityRouteLifecycle>,
): boolean {
  const visited = new Set<string>([start.from])
  let next = start.replacement
  while (next) {
    if (visited.has(next)) return true
    visited.add(next)
    next = bySource.get(next)?.replacement ?? null
  }
  return false
}

export function validateCompatibilityRoutes(routes: readonly CompatibilityRouteLifecycle[]): {
  ok: boolean
  diagnostics: CompatibilityRouteDiagnostic[]
} {
  const diagnostics: CompatibilityRouteDiagnostic[] = []
  const bySource = new Map<string, CompatibilityRouteLifecycle>()
  for (const item of routes) {
    if (bySource.has(item.from)) {
      diagnostics.push({ routeId: item.routeId, reasonCode: "compatibility_route_duplicated" })
    } else {
      bySource.set(item.from, item)
    }
    if (!item.replacement) {
      diagnostics.push({ routeId: item.routeId, reasonCode: "compatibility_replacement_missing" })
    }
    if (item.minimumRedirectVersions < 1) {
      diagnostics.push({ routeId: item.routeId, reasonCode: "compatibility_grace_period_missing" })
    }
    if (item.lifecycle === "remove_candidate") {
      if (item.telemetryEvidence !== "no_usage_observed") {
        diagnostics.push({ routeId: item.routeId, reasonCode: "removal_telemetry_missing" })
      }
      if (item.functionalParity !== "verified") {
        diagnostics.push({ routeId: item.routeId, reasonCode: "removal_functional_parity_missing" })
      }
      if (item.deepLinkVerification !== "verified") {
        diagnostics.push({
          routeId: item.routeId,
          reasonCode: "removal_deep_link_verification_missing",
        })
      }
    }
  }
  for (const item of routes) {
    if (item.replacement && participatesInCycle(item, bySource)) {
      diagnostics.push({ routeId: item.routeId, reasonCode: "compatibility_redirect_cycle" })
    }
  }
  return { ok: diagnostics.length === 0, diagnostics }
}

export type RouteCandidateClassification =
  | "duplicate_surface"
  | "dead_candidate"
  | "restricted_surface"

export interface RouteCandidate {
  path: string
  classification: RouteCandidateClassification
}

export function classifyRouteCandidates(input: {
  activeRoutes: readonly string[]
  targetRoutes: readonly string[]
  compatibilityRoutes: readonly CompatibilityRouteLifecycle[]
  restrictedRoutes: readonly string[]
}): RouteCandidate[] {
  const target = new Set(input.targetRoutes)
  const compatibility = new Set(input.compatibilityRoutes.map((item) => item.from))
  const restricted = new Set(input.restrictedRoutes)
  const results: RouteCandidate[] = []
  for (const path of input.activeRoutes) {
    if (target.has(path)) continue
    if (restricted.has(path)) {
      results.push({ path, classification: "restricted_surface" })
    } else if (compatibility.has(path)) {
      results.push({ path, classification: "duplicate_surface" })
    } else {
      results.push({ path, classification: "dead_candidate" })
    }
  }
  return results
}

export type PhaseZeroEvidenceState = "collected" | "missing"

export interface PhaseZeroEvidence {
  routeBaseline: PhaseZeroEvidenceState
  buildBaseline: PhaseZeroEvidenceState
  requestBaseline: PhaseZeroEvidenceState
  livePerformanceBaseline: PhaseZeroEvidenceState
  capabilityOwnershipBaseline: PhaseZeroEvidenceState
  compatibilityInventory: "valid" | "invalid" | "missing"
  startupRequestBudget: "within_budget" | "exceeded"
  livePerformanceReadiness: "release_ready" | "not_release_ready"
  capabilityMigration: "not_required" | "required"
}

export const CURRENT_PHASE_ZERO_EVIDENCE: Readonly<PhaseZeroEvidence> = {
  routeBaseline: "collected",
  buildBaseline: "collected",
  requestBaseline: "collected",
  livePerformanceBaseline: "collected",
  capabilityOwnershipBaseline: "collected",
  compatibilityInventory: "valid",
  startupRequestBudget: "exceeded",
  livePerformanceReadiness: "not_release_ready",
  capabilityMigration: "required",
} as const

export type PhaseOneEntryBlocker =
  | "route_baseline_missing"
  | "build_baseline_missing"
  | "request_baseline_missing"
  | "live_performance_baseline_missing"
  | "capability_ownership_baseline_missing"
  | "compatibility_inventory_missing"
  | "compatibility_inventory_invalid"

export type PhaseOneFollowUpReason =
  | "startup_request_budget_exceeded"
  | "live_performance_not_release_ready"
  | "capability_migration_required"

export function evaluatePhaseOneEntry(evidence: PhaseZeroEvidence): {
  allowed: boolean
  blockers: PhaseOneEntryBlocker[]
  followUpReasonCodes: PhaseOneFollowUpReason[]
} {
  const blockers: PhaseOneEntryBlocker[] = []
  if (evidence.routeBaseline === "missing") blockers.push("route_baseline_missing")
  if (evidence.buildBaseline === "missing") blockers.push("build_baseline_missing")
  if (evidence.requestBaseline === "missing") blockers.push("request_baseline_missing")
  if (evidence.livePerformanceBaseline === "missing")
    blockers.push("live_performance_baseline_missing")
  if (evidence.capabilityOwnershipBaseline === "missing")
    blockers.push("capability_ownership_baseline_missing")
  if (evidence.compatibilityInventory === "missing")
    blockers.push("compatibility_inventory_missing")
  if (evidence.compatibilityInventory === "invalid")
    blockers.push("compatibility_inventory_invalid")

  const followUpReasonCodes: PhaseOneFollowUpReason[] = []
  if (evidence.startupRequestBudget === "exceeded") {
    followUpReasonCodes.push("startup_request_budget_exceeded")
  }
  if (evidence.livePerformanceReadiness === "not_release_ready") {
    followUpReasonCodes.push("live_performance_not_release_ready")
  }
  if (evidence.capabilityMigration === "required") {
    followUpReasonCodes.push("capability_migration_required")
  }
  return { allowed: blockers.length === 0, blockers, followUpReasonCodes }
}
