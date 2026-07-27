import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  authorizeYeonjangSensitiveOperation,
  buildTruthfulNoYeonjangResult,
  decideNoYeonjangCapabilityGap,
  resolveExactYeonjangTarget,
  type YeonjangIdentityBoundarySnapshot,
  type YeonjangPermissionSnapshot,
} from "../packages/core/src/index.ts"
import {
  authorizePromptImprovementYeonjangInvariant,
  projectYeonjangToolBoundaryInvariantReview,
} from "../packages/core/src/contracts/prompt-improvement-yeonjang-invariants.ts"

const now = 1_000

function snapshot(instanceCount = 2): YeonjangIdentityBoundarySnapshot {
  const instances = [
    { id: "instance:local", alias: "local", callName: "내 컴퓨터", computerId: "computer:local" },
    { id: "instance:remote", alias: "remote", callName: "원격 컴퓨터", computerId: "computer:remote" },
  ].slice(0, instanceCount)
  return {
    schemaVersion: 1, capturedAt: now,
    runtime: { kind: "knowbee_runtime", runtimeId: "runtime:main", hostComputerId: "computer:local", observedAt: now },
    instances: instances.map((item, index) => ({
      kind: "yeonjang_instance", instanceId: item.id, label: index === 0 ? "로컬 연장" : "원격 연장",
      instanceAlias: item.alias, callNames: [item.callName], locality: index === 0 ? "local" : "remote",
      computerId: item.computerId, connectionState: "online", trustState: "trusted",
      capabilitySnapshotRef: `capability:${item.id}`, permissionSnapshotRef: `permission:${item.id}`,
      capabilityIds: ["screen.capture", "shell.exec"], observedAt: now,
    })),
    computers: [
      { kind: "computer", computerId: "computer:local", label: "내 Mac", operatingSystemId: "os:local", observedAt: now },
      ...(instanceCount > 1 ? [{ kind: "computer" as const, computerId: "computer:remote", label: "원격 PC", operatingSystemId: "os:remote", observedAt: now }] : []),
    ],
    operatingSystems: [
      { kind: "operating_system", operatingSystemId: "os:local", family: "macos", version: "15", architecture: "aarch64", observedAt: now },
      ...(instanceCount > 1 ? [{ kind: "operating_system" as const, operatingSystemId: "os:remote", family: "linux" as const, version: "24", architecture: "x86_64", observedAt: now }] : []),
    ],
  }
}

function permission(targetInstanceId = "instance:local"): YeonjangPermissionSnapshot {
  return {
    schemaVersion: 1, targetInstanceId, fingerprint: `permission:${targetInstanceId}`, capturedAt: now,
    entries: [{ effect: "screen_control", decision: "allow", reasonCode: "policy_allow" }],
  }
}

function sensitive(targetInstanceId = "instance:local") {
  return {
    targetInstanceId,
    decision: authorizeYeonjangSensitiveOperation({
      requestId: "request:1389", targetInstanceId, effect: "screen_control",
      actionFingerprint: "action:screen:1389", permissionSnapshot: permission(targetInstanceId), now, maxPermissionAgeMs: 100,
    }),
  }
}

function base(overrides: Record<string, unknown> = {}) {
  const identitySnapshot = snapshot()
  const exactTarget = resolveExactYeonjangTarget({
    selector: { type: "instance_id", instanceId: "instance:local" }, snapshot: identitySnapshot, maxAgeMs: 100,
  })
  return authorizePromptImprovementYeonjangInvariant({
    identitySnapshot, maxIdentityAgeMs: 100,
    scope: {
      kind: "single",
      selector: { type: "instance_id", instanceId: "instance:local" },
      targetDecision: exactTarget,
      requiredCapabilityIds: ["screen.capture"],
    },
    sensitiveOperations: [sensitive()],
    proposalFingerprint: "proposal:1389", baselineFingerprint: "yeonjang:baseline",
    proposedFingerprint: "yeonjang:proposed", goalSection3Fingerprint: "goal:section3:v1",
    reviewerRef: "reviewer:main", reviewedAt: now, expiresAt: now + 100,
    ...overrides,
  })
}

describe("task1389 prompt-improvement Yeonjang invariant review", () => {
  it("authorizes one exact connected instance with its required capability and permission", () => {
    expect(base()).toMatchObject({
      status: "authorized",
      receipt: {
        invariant: "tool_boundary", decision: "preserved", operationScope: "single",
        targetInstanceIds: ["instance:local"], requiredCapabilityIds: ["screen.capture"],
      },
    })
  })

  it("preserves Knowbee self-solve work and truthful blocked computer guidance when no Yeonjang exists", () => {
    const identitySnapshot = snapshot(0)
    const fallbackDecision = decideNoYeonjangCapabilityGap({
      snapshot: identitySnapshot, maxAgeMs: 100,
      steps: [
        { stepId: "plan", summary: "작업 계획 작성", executionKind: "knowbee_only" },
        { stepId: "capture", summary: "화면 캡처", executionKind: "yeonjang_required", requiredCapability: "screen.capture", requiredCapabilityName: "화면 캡처", userFacingReason: "연장이 연결되지 않았습니다.", userNextAction: "연장을 연결하고 다시 요청하세요." },
      ],
    })
    const truthfulResult = buildTruthfulNoYeonjangResult({ decision: fallbackDecision, selfSolveResults: [{ stepId: "plan", result: "계획을 작성했습니다." }] })
    expect(base({
      identitySnapshot,
      scope: { kind: "no_computer_control", fallbackDecision, truthfulResult },
      sensitiveOperations: [],
    })).toMatchObject({
      status: "authorized",
      receipt: { operationScope: "no_computer_control", targetInstanceIds: [], blockedCapabilityIds: ["screen.capture"] },
    })
  })

  it("authorizes all online instances only from an exact explicit user request", () => {
    const identitySnapshot = snapshot()
    expect(base({
      identitySnapshot,
      scope: {
        kind: "all_instances",
        broadcastIntent: { confirm: true, trustedOnly: true, requiredMethods: ["screen.capture"] },
        userRequest: {
          schemaVersion: 1, requestId: "request:all:1389", actorType: "user", explicitAllInstances: true,
          targetInstanceIds: ["instance:local", "instance:remote"], issuedAt: now, expiresAt: now + 100,
        },
        requiredCapabilityIds: ["screen.capture"],
      },
      sensitiveOperations: [sensitive("instance:local"), sensitive("instance:remote")],
    })).toMatchObject({
      status: "authorized",
      receipt: { operationScope: "all_instances", targetInstanceIds: ["instance:local", "instance:remote"] },
    })
  })

  it("rejects more than one Yeonjang instance bound to one computer", () => {
    const identitySnapshot = snapshot()
    identitySnapshot.instances[1] = { ...identitySnapshot.instances[1]!, computerId: "computer:local", locality: "local" }
    expect(base({ identitySnapshot })).toEqual({ status: "blocked", reasonCode: "host_instance_duplicate" })
  })

  it.each([
    ["not_found", "exact_target_required"],
    ["ambiguous", "exact_target_required"],
    ["unavailable", "exact_target_required"],
  ] as const)("rejects non-resolved single target status %s", (status, reasonCode) => {
    expect(base({
      scope: {
        kind: "single",
        selector: { type: "instance_id", instanceId: "instance:local" },
        targetDecision: { status, reasonCode: status === "not_found" ? "target_not_found" : status === "ambiguous" ? "target_ambiguous" : "target_offline", candidates: [] },
        requiredCapabilityIds: ["screen.capture"],
      },
    })).toEqual({ status: "blocked", reasonCode })
  })

  it("rejects missing capability and blocked sensitive authorization", () => {
    expect(base({ scope: { kind: "single", selector: { type: "instance_id", instanceId: "instance:local" }, targetDecision: resolveExactYeonjangTarget({ selector: { type: "instance_id", instanceId: "instance:local" }, snapshot: snapshot(), maxAgeMs: 100 }), requiredCapabilityIds: ["camera.capture"] } }))
      .toEqual({ status: "blocked", reasonCode: "target_capability_missing" })
    expect(base({ sensitiveOperations: [{ targetInstanceId: "instance:local", decision: { status: "blocked", effect: "screen_control", reasonCode: "approval_missing" } }] }))
      .toEqual({ status: "blocked", reasonCode: "sensitive_authorization_missing" })
  })

  it.each([
    [undefined, "all_instances_user_request_missing"],
    [{ schemaVersion: 1, requestId: "request", actorType: "system", explicitAllInstances: true, targetInstanceIds: ["instance:local", "instance:remote"], issuedAt: now, expiresAt: now + 100 }, "all_instances_user_request_invalid"],
    [{ schemaVersion: 1, requestId: "request", actorType: "user", explicitAllInstances: false, targetInstanceIds: ["instance:local", "instance:remote"], issuedAt: now, expiresAt: now + 100 }, "all_instances_user_request_invalid"],
    [{ schemaVersion: 1, requestId: "request", actorType: "user", explicitAllInstances: true, targetInstanceIds: ["instance:local"], issuedAt: now, expiresAt: now + 100 }, "all_instances_scope_mismatch"],
  ] as const)("blocks implicit or mismatched all-instance request %#", (userRequest, reasonCode) => {
    expect(base({
      scope: { kind: "all_instances", broadcastIntent: { confirm: true }, userRequest, requiredCapabilityIds: ["screen.capture"] },
      sensitiveOperations: [sensitive("instance:local"), sensitive("instance:remote")],
    })).toEqual({ status: "blocked", reasonCode })
  })

  it("rejects false or incomplete no-Yeonjang completion facts", () => {
    const identitySnapshot = snapshot(0)
    const fallbackDecision = decideNoYeonjangCapabilityGap({
      snapshot: identitySnapshot, maxAgeMs: 100,
      steps: [{ stepId: "capture", summary: "화면 캡처", executionKind: "yeonjang_required", requiredCapability: "screen.capture", requiredCapabilityName: "화면 캡처", userFacingReason: "연장 없음", userNextAction: "연장 연결" }],
    })
    expect(base({
      identitySnapshot,
      scope: { kind: "no_computer_control", fallbackDecision, truthfulResult: { schemaVersion: 1, status: "completed", completedSelfSolveResults: [], blockedSteps: [] } },
      sensitiveOperations: [],
    })).toEqual({ status: "blocked", reasonCode: "no_yeonjang_result_invalid" })
  })

  it("projects only exact current section-3 lineage", () => {
    const decision = base()
    if (decision.status !== "authorized") throw new Error("Expected Yeonjang invariant authorization.")
    expect(projectYeonjangToolBoundaryInvariantReview({ receipt: decision.receipt, expectedProposalFingerprint: "proposal:1389", currentGoalSection3Fingerprint: "goal:section3:v1", now }))
      .toMatchObject({ status: "authorized", review: { invariant: "tool_boundary", decision: "preserved" } })
    expect(projectYeonjangToolBoundaryInvariantReview({ receipt: decision.receipt, expectedProposalFingerprint: "proposal:other", currentGoalSection3Fingerprint: "goal:section3:v1", now }))
      .toEqual({ status: "blocked", reasonCode: "yeonjang_review_scope_mismatch" })
  })

  it("uses only injected snapshots, decisions, and receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-improvement-yeonjang-invariants.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
