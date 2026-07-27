import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  EXTERNAL_EFFECT_APPROVAL_KINDS,
  authorizePromptImprovementToolMcpInvariant,
  projectToolMcpBoundaryInvariantReview,
  type PromptCapabilityBindingSnapshot,
  type PromptCapabilityStateSnapshot,
  type PromptCapabilityCatalogSnapshot,
} from "../packages/core/src/contracts/prompt-improvement-tool-mcp-invariants.ts"

const now = 1_000
const agentIds = ["agent:main", "agent:research"]

function catalog(fingerprint = "catalog:v1"): PromptCapabilityCatalogSnapshot {
  return {
    schemaVersion: 1,
    fingerprint,
    skills: [{ catalogId: "skill:yeonjang", status: "enabled", toolNames: ["yeonjang_status", "screen_capture"] }],
    mcpServers: [{ catalogId: "mcp:browser", status: "enabled", toolNames: ["browser_search"] }],
  }
}

function gates(level: "none" | "policy" | "explicit" = "explicit") {
  return Object.fromEntries(EXTERNAL_EFFECT_APPROVAL_KINDS.map((kind) => [kind, level])) as Record<(typeof EXTERNAL_EFFECT_APPROVAL_KINDS)[number], typeof level>
}

function binding(agentId: string, kind: "skill" | "mcp_server", overrides: Partial<PromptCapabilityBindingSnapshot> = {}): PromptCapabilityBindingSnapshot {
  const catalogId = kind === "skill" ? "skill:yeonjang" : "mcp:browser"
  return {
    bindingId: `binding:${agentId}:${catalogId}`,
    ownerAgentId: agentId,
    catalogKind: kind,
    catalogId,
    status: "enabled",
    enabledToolNames: kind === "skill" ? ["yeonjang_status", "screen_capture"] : ["browser_search"],
    disabledToolNames: kind === "skill" ? ["shell_exec"] : [],
    ...(kind === "mcp_server" ? { secretScopeId: `secret:${agentId}:browser` } : {}),
    permissionProfileId: `permission:${agentId}:${kind}`,
    riskCeiling: "moderate",
    approvalRequiredFrom: "moderate",
    approvalGates: gates(),
    ...overrides,
  }
}

function state(kind: "baseline" | "proposed", overrides: Partial<PromptCapabilityStateSnapshot> = {}): PromptCapabilityStateSnapshot {
  return {
    schemaVersion: 1,
    stateKind: kind,
    catalogFingerprint: "catalog:v1",
    activeAgentIds: [...agentIds],
    bindings: agentIds.flatMap((agentId) => [binding(agentId, "skill"), binding(agentId, "mcp_server")]),
    ...overrides,
  }
}

function authorize(overrides: Record<string, unknown> = {}) {
  return authorizePromptImprovementToolMcpInvariant({
    baselineCatalog: catalog(),
    proposedCatalog: catalog(),
    baseline: state("baseline"),
    proposed: state("proposed"),
    proposalFingerprint: "proposal:1390",
    baselineFingerprint: "capability:baseline",
    proposedFingerprint: "capability:proposed",
    goalSection3Fingerprint: "goal:section3:v1",
    reviewerRef: "reviewer:main",
    reviewedAt: now,
    expiresAt: now + 100,
    ...overrides,
  })
}

describe("task1390 prompt-improvement Skill, MCP, and tool invariant review", () => {
  it("preserves common catalogs with independent per-agent bindings", () => {
    expect(authorize()).toMatchObject({
      status: "authorized",
      receipt: {
        invariant: "tool_boundary",
        decision: "preserved",
        proposalFingerprint: "proposal:1390",
        activeAgentIds: agentIds,
        catalogFingerprint: "catalog:v1",
        reviewedBindingCount: 4,
      },
    })
  })

  it.each([
    ["binding ID", (bindings: PromptCapabilityBindingSnapshot[]) => ({ ...bindings[2]!, bindingId: bindings[0]!.bindingId }), "binding_identity_shared"],
    ["binding owner", (bindings: PromptCapabilityBindingSnapshot[]) => ({ ...bindings[2]!, ownerAgentId: "agent:main" }), "binding_owner_mismatch"],
    ["secret scope", (bindings: PromptCapabilityBindingSnapshot[]) => ({ ...bindings[2]!, secretScopeId: "secret:agent:main:browser" }), "secret_scope_shared"],
  ] as const)("rejects cross-agent shared %s", (_label, mutate, reasonCode) => {
    const proposed = state("proposed")
    proposed.bindings[2] = mutate(proposed.bindings)
    expect(authorize({ proposed })).toEqual({ status: "blocked", reasonCode })
  })

  it("rejects altered common catalogs and state catalog lineage", () => {
    expect(authorize({ proposedCatalog: catalog("catalog:v2") }))
      .toEqual({ status: "blocked", reasonCode: "catalog_policy_changed" })
    expect(authorize({ proposed: state("proposed", { catalogFingerprint: "catalog:v2" }) }))
      .toEqual({ status: "blocked", reasonCode: "catalog_lineage_mismatch" })
  })

  it.each([
    ["new Skill binding", (bindings: PromptCapabilityBindingSnapshot[]) => [...bindings, binding("agent:main", "skill", { bindingId: "binding:new", catalogId: "skill:new" })], "capability_binding_added"],
    ["new MCP binding", (bindings: PromptCapabilityBindingSnapshot[]) => [...bindings, binding("agent:main", "mcp_server", { bindingId: "binding:new", catalogId: "mcp:new", secretScopeId: "secret:new" })], "capability_binding_added"],
    ["enabled tool", (bindings: PromptCapabilityBindingSnapshot[]) => bindings.map((item, index) => index === 0 ? { ...item, enabledToolNames: [...item.enabledToolNames, "shell_exec"] } : item), "tool_access_expanded"],
    ["risk ceiling", (bindings: PromptCapabilityBindingSnapshot[]) => bindings.map((item, index) => index === 0 ? { ...item, riskCeiling: "dangerous" as const } : item), "risk_ceiling_expanded"],
    ["disabled tool", (bindings: PromptCapabilityBindingSnapshot[]) => bindings.map((item, index) => index === 0 ? { ...item, disabledToolNames: [] } : item), "disabled_tool_reactivated"],
  ] as const)("rejects prompt-only capability expansion through %s", (_label, mutate, reasonCode) => {
    const proposed = state("proposed")
    proposed.bindings = mutate(proposed.bindings)
    expect(authorize({ proposed })).toEqual({ status: "blocked", reasonCode })
  })

  it("rejects re-enabling a disabled binding", () => {
    const baseline = state("baseline")
    baseline.bindings[0] = { ...baseline.bindings[0]!, status: "disabled" }
    expect(authorize({ baseline })).toEqual({ status: "blocked", reasonCode: "capability_binding_reactivated" })
  })

  it.each([
    ["secret scope", { secretScopeId: "secret:replacement" }],
    ["permission profile", { permissionProfileId: "permission:replacement" }],
  ] as const)("rejects changing an existing binding's %s", (_label, replacement) => {
    const proposed = state("proposed")
    proposed.bindings[1] = { ...proposed.bindings[1]!, ...replacement }
    expect(authorize({ proposed })).toEqual({ status: "blocked", reasonCode: "binding_scope_changed" })
  })

  it.each(EXTERNAL_EFFECT_APPROVAL_KINDS)("rejects a weaker %s approval gate", (effect) => {
    const proposed = state("proposed")
    proposed.bindings[0] = {
      ...proposed.bindings[0]!,
      approvalGates: { ...proposed.bindings[0]!.approvalGates, [effect]: "policy" },
    }
    expect(authorize({ proposed })).toEqual({ status: "blocked", reasonCode: "approval_gate_weakened" })
  })

  it("allows capability narrowing and stronger approval thresholds", () => {
    const proposed = state("proposed")
    proposed.bindings[0] = {
      ...proposed.bindings[0]!,
      enabledToolNames: ["yeonjang_status"],
      disabledToolNames: ["shell_exec", "screen_capture"],
      riskCeiling: "safe",
      approvalRequiredFrom: "safe",
    }
    expect(authorize({ proposed })).toMatchObject({ status: "authorized" })
  })

  it("projects only an exact current tool-boundary receipt", () => {
    const decision = authorize()
    if (decision.status !== "authorized") throw new Error("Expected tool/MCP invariant authorization.")
    expect(projectToolMcpBoundaryInvariantReview({
      receipt: decision.receipt,
      expectedProposalFingerprint: "proposal:1390",
      currentGoalSection3Fingerprint: "goal:section3:v1",
      now,
    })).toMatchObject({ status: "authorized", review: { invariant: "tool_boundary", decision: "preserved" } })
    expect(projectToolMcpBoundaryInvariantReview({
      receipt: decision.receipt,
      expectedProposalFingerprint: "proposal:other",
      currentGoalSection3Fingerprint: "goal:section3:v1",
      now,
    })).toEqual({ status: "blocked", reasonCode: "tool_mcp_review_scope_mismatch" })
  })

  it("uses only injected immutable snapshots and receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-improvement-tool-mcp-invariants.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
