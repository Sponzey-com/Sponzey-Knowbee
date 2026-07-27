import { describe, expect, it } from "vitest"
import {
  buildCanonicalPlanPolicyReceiptDescriptor,
  evaluateCanonicalPlanPolicy,
} from "../packages/core/src/runs/canonical-plan-policy.ts"

const fingerprint = `sha256:${"a".repeat(64)}` as const

function policyInput() {
  return {
    runId: "run:1",
    workId: "work:root:run:1",
    planFingerprint: fingerprint,
    capabilitySnapshot: {
      snapshotId: "capability-snapshot:1",
      fingerprint: `sha256:${"b".repeat(64)}` as const,
      bindings: [
        { capabilityId: "web.search", targetId: "agent:research", risk: "safe" as const },
        { capabilityId: "filesystem.write", targetId: "agent:local", risk: "approval_required" as const },
      ],
    },
    constraints: {
      requiredMethods: [],
      requestedMethods: ["web.search"],
      exclusiveMethods: ["web.search"],
      targetId: "agent:research",
      approvedCapabilityIds: [],
    },
  }
}

describe("canonical plan policy", () => {
  it("allows only a plan whose exclusive method and target have an available safe binding", () => {
    expect(evaluateCanonicalPlanPolicy(policyInput())).toMatchObject({
      outcome: "allowed",
      reasonCode: "plan_bindings_allowed",
    })

    expect(evaluateCanonicalPlanPolicy({
      ...policyInput(),
      constraints: { ...policyInput().constraints, exclusiveMethods: ["mcp.missing"] },
    })).toMatchObject({ outcome: "input_required", reasonCode: "exclusive_method_unavailable" })

    expect(evaluateCanonicalPlanPolicy({
      ...policyInput(),
      constraints: { ...policyInput().constraints, targetId: "agent:wrong" },
    })).toMatchObject({ outcome: "input_required", reasonCode: "target_binding_unavailable" })
  })

  it("requires explicit approval for a risky capability", () => {
    const input = policyInput()
    input.constraints.requestedMethods = ["filesystem.write"]
    input.constraints.exclusiveMethods = ["filesystem.write"]
    input.constraints.targetId = "agent:local"
    expect(evaluateCanonicalPlanPolicy(input)).toMatchObject({
      outcome: "approval_required",
      reasonCode: "capability_approval_required",
    })
    input.constraints.approvedCapabilityIds = ["filesystem.write"]
    expect(evaluateCanonicalPlanPolicy(input)).toMatchObject({ outcome: "allowed" })
  })

  it("denies a plan whose required runtime capability is unavailable", () => {
    const input = policyInput()
    input.constraints.requiredMethods = ["action:create_schedule"]
    expect(evaluateCanonicalPlanPolicy(input)).toMatchObject({
      outcome: "denied",
      reasonCode: "required_method_unavailable",
    })
  })

  it("treats requested methods as preferences and resolves an exact target among duplicate capabilities", () => {
    const preferredFallback = policyInput()
    preferredFallback.constraints.requestedMethods = ["mcp.preferred-but-unavailable"]
    preferredFallback.constraints.exclusiveMethods = []
    preferredFallback.constraints.targetId = undefined
    expect(evaluateCanonicalPlanPolicy(preferredFallback)).toMatchObject({ outcome: "allowed" })

    preferredFallback.constraints.targetId = "agent:requested"
    expect(evaluateCanonicalPlanPolicy(preferredFallback)).toMatchObject({
      outcome: "allowed",
      reasonCode: "plan_bindings_allowed",
    })

    const duplicateTarget = policyInput()
    duplicateTarget.capabilitySnapshot.bindings.unshift({
      capabilityId: "web.search",
      targetId: "agent:other",
      risk: "safe",
    })
    expect(evaluateCanonicalPlanPolicy(duplicateTarget)).toMatchObject({ outcome: "allowed" })
  })

  it("creates a deterministic policy receipt only for an allowed decision", () => {
    const input = policyInput()
    const allowed = evaluateCanonicalPlanPolicy(input)
    const descriptor = buildCanonicalPlanPolicyReceiptDescriptor({ input, decision: allowed })
    expect(descriptor).toMatchObject({ workId: input.workId, kind: "policy" })
    expect(descriptor.evidenceFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(JSON.stringify(descriptor)).not.toContain("web.search")

    const denied = evaluateCanonicalPlanPolicy({
      ...input,
      constraints: { ...input.constraints, exclusiveMethods: ["missing"] },
    })
    expect(() => buildCanonicalPlanPolicyReceiptDescriptor({ input, decision: denied })).toThrow(/allowed policy decision/i)
  })
})
