import { describe, expect, it, vi } from "vitest"

import type { TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import type { CanonicalIntakePlanPolicyResult } from "../packages/core/src/runs/canonical-intake-plan-policy.ts"
import { planCanonicalSelfSolveCapabilities } from "../packages/core/src/runs/canonical-self-solve-capability-planning.ts"

const cameraIntake = {
  intent: {
    category: "task_request",
    summary: "Capture and return a camera image.",
    confidence: 0.99,
  },
  user_message: { mode: "accepted_receipt", text: "확인했습니다." },
  identity_claim: {
    product_name: "Knowbee",
    assistant_name: "Knowbee",
    role: "assistant",
  },
  action_items: [
    {
      id: "camera-task",
      type: "run_task",
      title: "Capture a camera image",
      priority: "normal",
      reason: "The request requires an external capability.",
      payload: {
        preferred_methods: [],
        exclusive_methods: [],
      },
    },
  ],
  structured_request: {
    source_language: "ko",
    response_language_mode: "same_as_request",
    normalized_english: "Capture a camera image and return it to this conversation.",
    target: "",
    to: "this conversation",
    context: ["Use a currently executable capability."],
    complete_condition: ["A verified image artifact is returned."],
  },
  intent_envelope: {
    intent_type: "task_request",
    source_language: "ko",
    response_language_mode: "same_as_request",
    normalized_english: "Capture a camera image and return it to this conversation.",
    target: "",
    destination: "this conversation",
    context: ["Use a currently executable capability."],
    complete_condition: ["A verified image artifact is returned."],
    schedule_spec: {
      detected: false,
      kind: "none",
      status: "not_applicable",
      schedule_text: "",
    },
    execution_semantics: {
      filesystemEffect: "none",
      privilegedOperation: "required",
      artifactDelivery: "direct",
      approvalRequired: true,
      approvalTool: "yeonjang_camera_capture",
    },
    delivery_mode: "direct",
    requires_approval: true,
    approval_tool: "yeonjang_camera_capture",
    preferred_target: "",
    needs_tools: true,
    needs_web: false,
  },
  scheduling: {
    detected: false,
    kind: "none",
    status: "not_applicable",
    schedule_text: "",
  },
  execution: {
    requires_run: true,
    requires_delegation: false,
    suggested_target: "",
    max_delegation_turns: 3,
    needs_tools: true,
    needs_web: false,
    execution_semantics: {
      filesystemEffect: "none",
      privilegedOperation: "required",
      artifactDelivery: "direct",
      approvalRequired: true,
      approvalTool: "yeonjang_camera_capture",
    },
  },
  notes: ["llm-intake-result"],
} satisfies TaskIntakeResult

const allowedPolicy = {
  ok: true,
  input: {
    runId: "run-camera-plan",
    workId: "work:root-run:run-camera-plan",
    planFingerprint: `sha256:${"1".repeat(64)}`,
    capabilitySnapshot: {
      snapshotId: "snapshot:camera-plan",
      fingerprint: `sha256:${"2".repeat(64)}`,
      bindings: [
        {
          capabilityId: "action:run_task",
          targetId: "agent:knowbee",
          risk: "safe",
        },
        {
          capabilityId: "yeonjang_camera_capture",
          targetId: "client:camera-1",
          risk: "approval_required",
        },
      ],
      exclusions: [],
    },
    constraints: {
      requiredMethods: ["action:run_task"],
      requestedMethods: [],
      exclusiveMethods: [],
      approvedCapabilityIds: ["yeonjang_camera_capture"],
    },
  },
  descriptor: {
    runId: "run-camera-plan",
    workId: "work:root-run:run-camera-plan",
    receiptId: "receipt:policy:run-camera-plan",
    kind: "policy",
    evidenceFingerprint: `sha256:${"3".repeat(64)}`,
    evidenceRefs: ["policy:camera-plan"],
  },
} satisfies Extract<CanonicalIntakePlanPolicyResult, { ok: true }>

describe("canonical self-solve capability planning", () => {
  it("preserves the LLM-selected camera ref as an exact admission and Tool scope", async () => {
    const planSolution = vi.fn(async (input: { capabilityRefs: string[] }) => ({
      ownerAgentName: "Knowbee",
      steps: [
        {
          step_id: "capture",
          owner_agent_name: "Knowbee",
          action_type: "use_yeonjang",
          input_refs: ["request:user", input.capabilityRefs[0]],
          expected_output: "A camera image artifact.",
          completion_criteria: "The image artifact is verified.",
          status: "pending",
        },
        {
          step_id: "verify",
          owner_agent_name: "Knowbee",
          action_type: "validate",
          input_refs: ["step:capture"],
          expected_output: "Verified artifact evidence.",
          completion_criteria: "The requested artifact is ready for delivery.",
          status: "pending",
        },
      ],
    }))

    const result = await planCanonicalSelfSolveCapabilities({
      runId: "run-camera-plan",
      intake: cameraIntake,
      policy: allowedPolicy,
      ownerAgentId: "agent:knowbee",
      ownerAgentName: "Knowbee",
      requestDiagnosisReceiptId: "receipt:intake:run-camera-plan",
      requestDiagnosisIssuedAt: 100,
      issuedAt: 101,
      provider: { planSolution },
      skillDefinitions: [],
      skillBindings: [],
      instructionSkills: [],
    })

    expect(planSolution).toHaveBeenCalledWith(expect.objectContaining({
      capabilityRefs: ["capability:yeonjang_camera_capture"],
    }))
    if (!result.ok) throw new Error(result.reasonCode)
    expect(result).toMatchObject({
      ok: true,
      solutionPlanReceiptId: "receipt:solution-plan:run-camera-plan:101",
      admission: {
        entries: [
          {
            stepId: "capture",
            capabilityRef: "capability:yeonjang_camera_capture",
            capabilityId: "yeonjang_camera_capture",
            targetId: "client:camera-1",
          },
        ],
      },
      scope: {
        runId: "run-camera-plan",
        ownerAgentId: "agent:knowbee",
        selectedCapabilityId: "yeonjang_camera_capture",
        selectedTargetIds: ["client:camera-1"],
        toolNames: ["yeonjang_camera_capture"],
      },
    })
  })

  it("rejects an ambiguous executable target instead of choosing an implicit default", async () => {
    const policy = {
      ...allowedPolicy,
      input: {
        ...allowedPolicy.input,
        constraints: {
          ...allowedPolicy.input.constraints,
          approvedCapabilityIds: [],
        },
        capabilitySnapshot: {
          ...allowedPolicy.input.capabilitySnapshot,
          bindings: [
            ...allowedPolicy.input.capabilitySnapshot.bindings,
            {
              capabilityId: "yeonjang_camera_capture",
              targetId: "client:camera-2",
              risk: "safe" as const,
            },
          ],
        },
      },
    }

    const result = await planCanonicalSelfSolveCapabilities({
      runId: "run-camera-plan",
      intake: cameraIntake,
      policy,
      ownerAgentId: "agent:knowbee",
      ownerAgentName: "Knowbee",
      requestDiagnosisReceiptId: "receipt:intake:run-camera-plan",
      requestDiagnosisIssuedAt: 100,
      issuedAt: 101,
      provider: {
        planSolution: async () => ({
          ownerAgentName: "Knowbee",
          steps: [
            {
              step_id: "capture",
              owner_agent_name: "Knowbee",
              action_type: "use_yeonjang",
              input_refs: ["capability:yeonjang_camera_capture"],
              expected_output: "An image.",
              completion_criteria: "The image exists.",
              status: "pending",
            },
          ],
        }),
      },
      skillDefinitions: [],
      skillBindings: [],
      instructionSkills: [],
    })

    expect(result).toEqual({
      ok: false,
      reasonCode: "capability_admission_target_ambiguous",
      solutionPlanReceiptId: "receipt:solution-plan:run-camera-plan:101",
      capabilitySelections: [
        {
          stepId: "capture",
          capabilityRef: "capability:yeonjang_camera_capture",
        },
      ],
    })
  })
})
