import { describe, expect, it } from "vitest"
import { buildCanonicalIntakePlanPolicy } from "../packages/core/src/runs/canonical-intake-plan-policy.ts"
import type { TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import { buildCanonicalExecutionAdmissionDescriptor } from "../packages/core/src/runs/canonical-execution-admission.ts"
import { buildCanonicalAttemptEvidenceDescriptor } from "../packages/core/src/runs/canonical-attempt-evidence.ts"

function intake(payload: Record<string, unknown> = {}): TaskIntakeResult {
  return {
    intent: { category: "task_intake", summary: "run", confidence: 1 }, user_message: { mode: "accepted_receipt", text: "accepted" },
    action_items: [{ id: "1", type: "run_task", title: "run", priority: "normal", reason: "requested", payload }],
    structured_request: { source_language: "en", normalized_english: "run", target: "run", to: "user", context: [], complete_condition: ["done"] },
    intent_envelope: { intent_type: "task_intake", source_language: "en", normalized_english: "run", target: "run", destination: "user", context: [], complete_condition: ["done"], schedule_spec: { detected: false, kind: "none", status: "not_applicable", schedule_text: "" }, execution_semantics: { filesystemEffect: "none", privilegedOperation: "none", artifactDelivery: "none", approvalRequired: false, approvalTool: "external_action" }, delivery_mode: "none", requires_approval: false, approval_tool: "external_action", preferred_target: "auto", needs_tools: false, needs_web: false },
    scheduling: { detected: false, kind: "none", status: "not_applicable", schedule_text: "" }, execution: { requires_run: true, requires_delegation: false, suggested_target: "auto", max_delegation_turns: 1, needs_tools: false, needs_web: false, execution_semantics: { filesystemEffect: "none", privilegedOperation: "none", artifactDelivery: "none", approvalRequired: false, approvalTool: "external_action" } }, notes: [],
  }
}
const registry = { generatedAt: 1, agents: [], teams: [], membershipEdges: [], diagnostics: [] }

describe("canonical intake plan policy adapter", () => {
  it("turns the LLM web requirement into a policy-evaluated initial method", () => {
    const webIntake = intake()
    webIntake.execution.needs_tools = true
    webIntake.execution.needs_web = true
    webIntake.intent_envelope.needs_tools = true
    webIntake.intent_envelope.needs_web = true

    const result = buildCanonicalIntakePlanPolicy({
      runId: "run:web",
      intake: webIntake,
      registry,
      tools: [{
        name: "web_search",
        description: "",
        parameters: { type: "object", properties: {} },
        riskLevel: "safe",
        requiresApproval: false,
        execute: async () => ({ success: true, output: "" }),
      }],
    })

    expect(result).toMatchObject({
      ok: true,
      input: {
        constraints: {
          requestedMethods: ["web_search"],
          exclusiveMethods: [],
        },
      },
    })
  })

  it("binds supported action capabilities and exact registered tools", () => {
    const result = buildCanonicalIntakePlanPolicy({ runId: "run:1", intake: intake({ preferred_methods: ["web_search"] }), registry, tools: [{ name: "web_search", description: "", parameters: { type: "object", properties: {} }, riskLevel: "safe", requiresApproval: false, execute: async () => ({ success: true, output: "" }) }] })
    expect(result).toMatchObject({ ok: true, input: { constraints: { requiredMethods: ["action:run_task"] } }, descriptor: { kind: "policy" } })
  })

  it("admits an approval-required Tool plan and defers user approval to its exact operation boundary", () => {
    const result = buildCanonicalIntakePlanPolicy({
      runId: "run:camera",
      intake: intake({ exclusive_methods: ["yeonjang_camera_capture"] }),
      registry,
      tools: [{
        name: "yeonjang_camera_capture",
        description: "",
        parameters: { type: "object", properties: {} },
        riskLevel: "high",
        requiresApproval: true,
        execute: async () => ({ success: true, output: "" }),
      }],
    })

    expect(result).toMatchObject({
      ok: true,
      input: {
        constraints: {
          approvedCapabilityIds: [],
        },
      },
      descriptor: { kind: "policy" },
    })
    if (!result.ok) throw new Error("expected allowed camera plan")
    expect(result.input.capabilitySnapshot.bindings).toEqual(
      expect.arrayContaining([expect.objectContaining({
        capabilityId: "yeonjang_camera_capture",
        risk: "approval_required",
      })]),
    )
  })

  it("fails closed for unavailable exclusive methods and conflicting targets", () => {
    expect(buildCanonicalIntakePlanPolicy({ runId: "run:1", intake: intake({ exclusive_methods: ["missing"] }), registry, tools: [] })).toMatchObject({
      ok: false,
      reasonCode: "exclusive_method_unavailable",
      decision: { outcome: "input_required" },
    })
    const conflicted = intake({ target_instance: "one" })
    conflicted.action_items.push({ ...conflicted.action_items[0]!, id: "2", payload: { target_instance: "two" } })
    expect(buildCanonicalIntakePlanPolicy({ runId: "run:1", intake: conflicted, registry, tools: [] })).toEqual({ ok: false, reasonCode: "target_instance_conflict" })
  })

  it("binds canonical capabilities to the configured main agent identity", () => {
    const result = buildCanonicalIntakePlanPolicy({
      runId: "run:custom-main",
      rootAgentId: "agent:custom-main",
      intake: intake(),
      registry,
      tools: [],
    })

    expect(result).toMatchObject({
      ok: true,
      input: {
        capabilitySnapshot: {
          bindings: [
            {
              capabilityId: "action:run_task",
              targetId: "agent:custom-main",
            },
          ],
        },
      },
    })
  })

})

describe("canonical execution admission descriptor", () => {
  it("binds execution to the current executor and cancellation token without raw request text", () => {
    const result = buildCanonicalExecutionAdmissionDescriptor({ runId: "run:1", intake: intake({ target_instance: "pc:office" }), executorId: "agent:knowbee", cancellationTokenId: "root-run:run:1", signalAborted: false })
    expect(result).toMatchObject({ ok: true, descriptor: { kind: "execution", workId: "work:root:run:1" } })
    expect(JSON.stringify(result)).not.toContain("normalized_english")
  })
  it("rejects an already aborted execution", () => {
    expect(buildCanonicalExecutionAdmissionDescriptor({ runId: "run:1", intake: intake(), executorId: "agent:knowbee", cancellationTokenId: "root-run:run:1", signalAborted: true })).toEqual({ ok: false, reasonCode: "execution_cancelled" })
  })
})

describe("canonical attempt evidence descriptor", () => {
  it("fingerprints success and structured failure without retaining raw preview", () => {
    const descriptor = buildCanonicalAttemptEvidenceDescriptor({ runId: "run:1", successfulToolNames: ["web_search", "web_search"], attempt: { preview: "secret raw result", failed: true, executionRecoveryLimitStop: null, aiRecoveryLimitStop: null, aiRecovery: null, workerRuntimeRecovery: null, executionRecovery: null, sawRealFilesystemMutation: false, commandFailureSeen: true, commandRecoveredWithinSamePass: false } })
    expect(descriptor).toMatchObject({ kind: "attempt", workId: "work:root:run:1" })
    expect(descriptor.evidenceFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(JSON.stringify(descriptor)).not.toContain("secret raw result")
    expect(descriptor.evidenceRefs).toContain("tool-receipt:web_search")
  })
})
