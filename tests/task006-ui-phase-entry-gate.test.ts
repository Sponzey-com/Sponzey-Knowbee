import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  CURRENT_COMPATIBILITY_ROUTE_BASELINE,
  CURRENT_PHASE_ZERO_EVIDENCE,
  type CompatibilityRouteLifecycle,
  classifyRouteCandidates,
  evaluatePhaseOneEntry,
  validateCompatibilityRoutes,
} from "../packages/webui/src/lib/ui-phase-entry-gate.js"

function removableRoute(
  overrides: Partial<CompatibilityRouteLifecycle> = {},
): CompatibilityRouteLifecycle {
  return {
    routeId: "legacy.settings",
    from: "/legacy-settings",
    replacement: "/settings",
    lifecycle: "remove_candidate",
    access: "internal",
    queryIntent: "preserve",
    minimumRedirectVersions: 1,
    telemetryEvidence: "no_usage_observed",
    functionalParity: "verified",
    deepLinkVerification: "verified",
    ...overrides,
  }
}

describe("task006 Phase 0 compatibility and entry gate", () => {
  it("rejects missing replacements, redirect cycles, and unsupported removal claims", () => {
    const result = validateCompatibilityRoutes([
      removableRoute({
        routeId: "missing",
        from: "/missing",
        replacement: null,
        lifecycle: "redirect",
      }),
      removableRoute({
        routeId: "cycle-a",
        from: "/cycle-a",
        replacement: "/cycle-b",
        lifecycle: "redirect",
      }),
      removableRoute({
        routeId: "cycle-b",
        from: "/cycle-b",
        replacement: "/cycle-a",
        lifecycle: "redirect",
      }),
      removableRoute({
        routeId: "unsafe-removal",
        from: "/unsafe",
        telemetryEvidence: "not_collected",
        functionalParity: "unverified",
        deepLinkVerification: "unverified",
      }),
    ])

    expect(new Set(result.diagnostics.map((item) => item.reasonCode))).toEqual(
      new Set([
        "compatibility_replacement_missing",
        "compatibility_redirect_cycle",
        "removal_telemetry_missing",
        "removal_functional_parity_missing",
        "removal_deep_link_verification_missing",
      ]),
    )
  })

  it("classifies duplicate, dead, and restricted routes without treating restricted routes as dead", () => {
    expect(
      classifyRouteCandidates({
        activeRoutes: ["/chat", "/legacy-chat", "/orphan", "/admin/*", "/advanced/audit"],
        targetRoutes: ["/chat"],
        compatibilityRoutes: [
          removableRoute({ from: "/legacy-chat", replacement: "/chat", lifecycle: "redirect" }),
        ],
        restrictedRoutes: ["/admin/*", "/advanced/audit"],
      }),
    ).toEqual([
      { path: "/legacy-chat", classification: "duplicate_surface" },
      { path: "/orphan", classification: "dead_candidate" },
      { path: "/admin/*", classification: "restricted_surface" },
      { path: "/advanced/audit", classification: "restricted_surface" },
    ])
  })

  it("keeps every current compatibility entry valid while withholding removal approval", () => {
    expect(validateCompatibilityRoutes(CURRENT_COMPATIBILITY_ROUTE_BASELINE)).toEqual({
      ok: true,
      diagnostics: [],
    })
    expect(CURRENT_COMPATIBILITY_ROUTE_BASELINE.length).toBeGreaterThanOrEqual(29)
    expect(
      CURRENT_COMPATIBILITY_ROUTE_BASELINE.every((item) => item.lifecycle === "redirect"),
    ).toBe(true)
    expect(
      CURRENT_COMPATIBILITY_ROUTE_BASELINE.every(
        (item) => item.telemetryEvidence === "not_collected",
      ),
    ).toBe(true)
  })

  it("allows Phase 1 route contract work but carries measured optimization and migration gaps forward", () => {
    const result = evaluatePhaseOneEntry(CURRENT_PHASE_ZERO_EVIDENCE)
    expect(result.allowed).toBe(true)
    expect(result.blockers).toEqual([])
    expect(result.followUpReasonCodes).toEqual([
      "startup_request_budget_exceeded",
      "live_performance_not_release_ready",
      "capability_migration_required",
    ])

    const missing = evaluatePhaseOneEntry({
      ...CURRENT_PHASE_ZERO_EVIDENCE,
      routeBaseline: "missing",
    })
    expect(missing.allowed).toBe(false)
    expect(missing.blockers).toEqual(["route_baseline_missing"])
  })

  it("has no environment, network, filesystem, or logging side effects", () => {
    const source = readFileSync("packages/webui/src/lib/ui-phase-entry-gate.ts", "utf8")
    expect(source).not.toMatch(/process\.env|fetch\(|readFile|writeFile/)
    expect(source).not.toMatch(/console\.|logger\./)
  })
})
