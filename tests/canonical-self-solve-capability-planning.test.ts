import { describe, expect, it, vi } from "vitest"

import type { TaskIntakeResult } from "../packages/core/src/agent/intake.ts"
import type { CanonicalIntakePlanPolicyResult } from "../packages/core/src/runs/canonical-intake-plan-policy.ts"
import { planCanonicalSelfSolveCapabilities } from "../packages/core/src/runs/canonical-self-solve-capability-planning.ts"
import { buildChannelArtifactDeliveryExecutionTargetRef } from "../packages/core/src/runs/channel-artifact-delivery-requirement.ts"

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
  it("offers the selected device method before generic executors", async () => {
    const intake = structuredClone(cameraIntake)
    intake.execution.execution_semantics.approvalTool = "external_action"
    intake.intent_envelope.execution_semantics.approvalTool = "external_action"
    intake.intent_envelope.approval_tool = "external_action"
    const policy = {
      ...allowedPolicy,
      input: {
        ...allowedPolicy.input,
        constraints: {
          ...allowedPolicy.input.constraints,
          requestedMethods: ["yeonjang_camera_capture"],
          approvedCapabilityIds: [],
        },
        capabilitySnapshot: {
          ...allowedPolicy.input.capabilitySnapshot,
          bindings: [
            ...allowedPolicy.input.capabilitySnapshot.bindings,
            {
              capabilityId: "shell_exec",
              targetId: "client:camera-1",
              risk: "approval_required" as const,
            },
            {
              capabilityId: "telegram_send_file",
              targetId: "agent:knowbee",
              risk: "approval_required" as const,
            },
          ],
        },
      },
    }
    const planSolution = vi.fn(async () => ({
      ownerAgentName: "Knowbee",
      steps: [
        {
          step_id: "capture",
          owner_agent_name: "Knowbee",
          action_type: "use_yeonjang",
          input_refs: ["capability:yeonjang_camera_capture"],
          expected_output: "A verified camera artifact.",
          completion_criteria: "The camera artifact is verified.",
          status: "pending",
        },
        {
          step_id: "deliver",
          owner_agent_name: "Knowbee",
          action_type: "use_tool",
          input_refs: ["capability:telegram_send_file", "step:capture"],
          expected_output: "The artifact is delivered.",
          completion_criteria: "A Telegram delivery receipt exists.",
          status: "pending",
        },
      ],
    }))

    const result = await planCanonicalSelfSolveCapabilities({
      runId: "run-device-priority",
      intake,
      policy,
      ownerAgentId: "agent:knowbee",
      ownerAgentName: "Knowbee",
      requestDiagnosisReceiptId: "receipt:intake:run-device-priority",
      requestDiagnosisIssuedAt: 100,
      issuedAt: 101,
      provider: { planSolution },
      artifactDeliveryRequirement: {
        capabilityRef: "capability:telegram_send_file",
        bindingTargetId: "agent:knowbee",
        executionTargetId: "destination:telegram:current-chat",
      },
      capabilityMetadata: [
        {
          capabilityId: "yeonjang_camera_capture",
          description: "Capture one camera image through the selected extension.",
          effectClass: "local_write",
        },
        {
          capabilityId: "shell_exec",
          description: "Execute an arbitrary local shell command.",
          effectClass: "local_write",
        },
        {
          capabilityId: "telegram_send_file",
          description: "Deliver an existing artifact to Telegram.",
          effectClass: "external_write",
        },
      ],
      skillDefinitions: [],
      skillBindings: [],
      instructionSkills: [],
    })

    expect(planSolution).toHaveBeenCalledWith(expect.objectContaining({
      capabilityRefs: [
        "capability:telegram_send_file",
        "capability:yeonjang_camera_capture",
      ],
      requiredCapabilityRefs: [
        "capability:telegram_send_file",
        "capability:yeonjang_camera_capture",
      ],
    }))
    expect(result).toMatchObject({
      ok: true,
      scope: {
        toolNames: [
          "telegram_send_file",
          "yeonjang_camera_capture",
        ],
      },
    })
  })

  it("fails closed when the selected method is absent instead of widening to a generic executor", async () => {
    const policy = {
      ...allowedPolicy,
      input: {
        ...allowedPolicy.input,
        constraints: {
          ...allowedPolicy.input.constraints,
          requestedMethods: ["yeonjang_camera_capture"],
        },
        capabilitySnapshot: {
          ...allowedPolicy.input.capabilitySnapshot,
          bindings: [
            {
              capabilityId: "action:run_task",
              targetId: "agent:knowbee",
              risk: "safe" as const,
            },
            {
              capabilityId: "shell_exec",
              targetId: "agent:knowbee",
              risk: "approval_required" as const,
            },
          ],
        },
      },
    }
    const planSolution = vi.fn()

    const result = await planCanonicalSelfSolveCapabilities({
      runId: "run-device-method-unavailable",
      intake: cameraIntake,
      policy,
      ownerAgentId: "agent:knowbee",
      ownerAgentName: "Knowbee",
      requestDiagnosisReceiptId: "receipt:intake:run-device-method-unavailable",
      requestDiagnosisIssuedAt: 100,
      issuedAt: 101,
      provider: { planSolution },
      skillDefinitions: [],
      skillBindings: [],
      instructionSkills: [],
    })

    expect(result).toEqual({
      ok: false,
      reasonCode: "solution_plan_selected_capability_unavailable",
    })
    expect(planSolution).not.toHaveBeenCalled()
  })

  it("requires separate capture and direct Telegram delivery selections", async () => {
    const policy = {
      ...allowedPolicy,
      input: {
        ...allowedPolicy.input,
        capabilitySnapshot: {
          ...allowedPolicy.input.capabilitySnapshot,
          bindings: [
            ...allowedPolicy.input.capabilitySnapshot.bindings,
            {
              capabilityId: "telegram_send_file",
              targetId: "agent:knowbee",
              risk: "approval_required" as const,
            },
          ],
        },
      },
    }
    const planSolution = vi.fn(async () => ({
      ownerAgentName: "Knowbee",
      steps: [
        {
          step_id: "capture",
          owner_agent_name: "Knowbee",
          action_type: "use_yeonjang",
          input_refs: ["capability:yeonjang_camera_capture"],
          expected_output: "A verified camera artifact.",
          completion_criteria: "The camera artifact is verified.",
          status: "pending",
        },
        {
          step_id: "deliver",
          owner_agent_name: "Knowbee",
          action_type: "use_tool",
          input_refs: ["capability:telegram_send_file", "step:capture"],
          expected_output: "The artifact is delivered to the current chat.",
          completion_criteria: "A Telegram delivery receipt exists.",
          status: "pending",
        },
      ],
    }))

    const result = await planCanonicalSelfSolveCapabilities({
      runId: "run-camera-plan",
      intake: cameraIntake,
      policy,
      ownerAgentId: "agent:knowbee",
      ownerAgentName: "Knowbee",
      requestDiagnosisReceiptId: "receipt:intake:run-camera-plan",
      requestDiagnosisIssuedAt: 100,
      issuedAt: 101,
      provider: { planSolution },
      artifactDeliveryRequirement: {
        capabilityRef: "capability:telegram_send_file",
        bindingTargetId: "agent:knowbee",
        executionTargetId: "destination:telegram:current-chat",
      },
      capabilityMetadata: [
        {
          capabilityId: "yeonjang_camera_capture",
          description: "Capture one camera image and return verified artifact evidence.",
          effectClass: "local_write",
        },
        {
          capabilityId: "telegram_send_file",
          description: "Deliver an existing artifact to the current Telegram chat.",
          effectClass: "external_write",
        },
      ],
      skillDefinitions: [],
      skillBindings: [],
      instructionSkills: [],
    })

    expect(planSolution).toHaveBeenCalledWith(expect.objectContaining({
      capabilityRefs: [
        "capability:telegram_send_file",
        "capability:yeonjang_camera_capture",
      ],
      requiredCapabilityRefs: [
        "capability:telegram_send_file",
        "capability:yeonjang_camera_capture",
      ],
      capabilityOptions: [
        {
          capabilityRef: "capability:telegram_send_file",
          description: "Deliver an existing artifact to the current Telegram chat.",
          effectClass: "external_write",
          risk: "approval_required",
        },
        {
          capabilityRef: "capability:yeonjang_camera_capture",
          description: "Capture one camera image and return verified artifact evidence.",
          effectClass: "local_write",
          risk: "approval_required",
        },
      ],
    }))
    expect(result).toMatchObject({
      ok: true,
      admission: {
        entries: [
          {
            stepId: "capture",
            capabilityId: "yeonjang_camera_capture",
            targetId: "client:camera-1",
          },
          {
            stepId: "deliver",
            capabilityId: "telegram_send_file",
            targetId: "destination:telegram:current-chat",
          },
        ],
      },
    })
  })

  it("gives the LLM effect metadata when intake did not name the purpose-specific approval tool", async () => {
    const intake = structuredClone(cameraIntake)
    intake.execution.execution_semantics.approvalTool = "external_action"
    intake.intent_envelope.execution_semantics.approvalTool = "external_action"
    intake.intent_envelope.approval_tool = "external_action"
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
              capabilityId: "yeonjang_status",
              targetId: "client:camera-1",
              risk: "safe" as const,
            },
            {
              capabilityId: "telegram_send_file",
              targetId: "agent:knowbee",
              risk: "approval_required" as const,
            },
          ],
        },
      },
    }
    const planSolution = vi.fn(async (input: {
      capabilityOptions?: Array<{
        capabilityRef: string
        effectClass: string
      }>
    }) => {
      expect(input.capabilityOptions).toEqual([
        expect.objectContaining({
          capabilityRef: "capability:telegram_send_file",
          effectClass: "external_write",
        }),
        expect.objectContaining({
          capabilityRef: "capability:yeonjang_camera_capture",
          effectClass: "local_write",
        }),
        expect.objectContaining({
          capabilityRef: "capability:yeonjang_status",
          effectClass: "read_only",
        }),
      ])
      return {
        ownerAgentName: "Knowbee",
        steps: [
          {
            step_id: "capture",
            owner_agent_name: "Knowbee",
            action_type: "use_yeonjang",
            input_refs: ["capability:yeonjang_camera_capture"],
            expected_output: "A verified camera artifact.",
            completion_criteria: "The requested image artifact is verified.",
            status: "pending",
          },
          {
            step_id: "deliver",
            owner_agent_name: "Knowbee",
            action_type: "use_tool",
            input_refs: ["capability:telegram_send_file", "step:capture"],
            expected_output: "The camera artifact is delivered.",
            completion_criteria: "A Telegram delivery receipt exists.",
            status: "pending",
          },
        ],
      }
    })

    const result = await planCanonicalSelfSolveCapabilities({
      runId: "run-camera-plan",
      intake,
      policy,
      ownerAgentId: "agent:knowbee",
      ownerAgentName: "Knowbee",
      requestDiagnosisReceiptId: "receipt:intake:run-camera-plan",
      requestDiagnosisIssuedAt: 100,
      issuedAt: 101,
      provider: { planSolution },
      artifactDeliveryRequirement: {
        capabilityRef: "capability:telegram_send_file",
        bindingTargetId: "agent:knowbee",
        executionTargetId: "destination:telegram:current-chat",
      },
      capabilityMetadata: [
        {
          capabilityId: "yeonjang_camera_capture",
          description: "Capture one camera image and return verified artifact evidence.",
          effectClass: "local_write",
        },
        {
          capabilityId: "yeonjang_status",
          description: "Read Yeonjang connectivity and capability status.",
          effectClass: "read_only",
        },
        {
          capabilityId: "telegram_send_file",
          description: "Deliver an existing artifact to the current Telegram chat.",
          effectClass: "external_write",
        },
      ],
      skillDefinitions: [],
      skillBindings: [],
      instructionSkills: [],
    })

    expect(planSolution).toHaveBeenCalledWith(expect.objectContaining({
      requiredCapabilityRefs: ["capability:telegram_send_file"],
    }))
    expect(result).toMatchObject({
      ok: true,
      admission: {
        outcome: "approval_required",
        approvalRequiredCapabilityIds: [
          "telegram_send_file",
          "yeonjang_camera_capture",
        ],
      },
      scope: {
        toolNames: [
          "telegram_send_file",
          "yeonjang_camera_capture",
        ],
      },
    })
  })

  it("binds an LLM-selected channel delivery capability even when intake omitted direct delivery", async () => {
    const intake = structuredClone(cameraIntake)
    intake.execution.execution_semantics = {
      ...intake.execution.execution_semantics,
      artifactDelivery: "none",
      approvalTool: "external_action",
    }
    intake.intent_envelope.execution_semantics = {
      ...intake.intent_envelope.execution_semantics,
      artifactDelivery: "none",
      approvalTool: "external_action",
    }
    intake.intent_envelope.delivery_mode = "none"
    intake.intent_envelope.approval_tool = "external_action"
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
              capabilityId: "telegram_send_file",
              targetId: "agent:knowbee",
              risk: "approval_required" as const,
            },
          ],
        },
      },
    }
    const result = await planCanonicalSelfSolveCapabilities({
      runId: "run-camera-plan",
      intake,
      policy,
      ownerAgentId: "agent:knowbee",
      ownerAgentName: "Knowbee",
      source: "telegram",
      destinationId: "session-1",
      requestDiagnosisReceiptId: "receipt:intake:run-camera-plan",
      requestDiagnosisIssuedAt: 100,
      issuedAt: 101,
      provider: {
        planSolution: vi.fn(async () => ({
          ownerAgentName: "Knowbee",
          steps: [
            {
              step_id: "capture",
              owner_agent_name: "Knowbee",
              action_type: "use_yeonjang",
              input_refs: ["capability:yeonjang_camera_capture"],
              expected_output: "A camera artifact.",
              completion_criteria: "The artifact exists.",
              status: "pending",
            },
            {
              step_id: "deliver",
              owner_agent_name: "Knowbee",
              action_type: "use_tool",
              input_refs: ["capability:telegram_send_file", "step:capture"],
              expected_output: "A delivery receipt.",
              completion_criteria: "The artifact is delivered.",
              status: "pending",
            },
          ],
        })),
      },
      capabilityMetadata: [
        {
          capabilityId: "yeonjang_camera_capture",
          description: "Capture one camera image.",
          effectClass: "local_write",
        },
        {
          capabilityId: "telegram_send_file",
          description: "Deliver an existing artifact.",
          effectClass: "external_write",
          channelCapability: {
            kind: "direct_artifact_delivery",
            channel: "telegram",
          },
        },
      ],
      skillDefinitions: [],
      skillBindings: [],
      instructionSkills: [],
    })

    if (!result.ok) throw new Error(result.reasonCode)
    expect(result.scope.selectedToolTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        capabilityId: "telegram_send_file",
        targetId: buildChannelArtifactDeliveryExecutionTargetRef("telegram", "session-1"),
      }),
    ]))
  })

  it("keeps an explicit Yeonjang instance target separate from the owning agent binding", async () => {
    const policy = {
      ...allowedPolicy,
      input: {
        ...allowedPolicy.input,
        constraints: {
          ...allowedPolicy.input.constraints,
          targetId: "yeonjang-main",
        },
        capabilitySnapshot: {
          ...allowedPolicy.input.capabilitySnapshot,
          bindings: allowedPolicy.input.capabilitySnapshot.bindings.map((binding) =>
            binding.capabilityId === "yeonjang_camera_capture"
              ? { ...binding, targetId: "agent:knowbee" }
              : binding,
          ),
        },
      },
    }
    const planSolution = vi.fn(async () => ({
      ownerAgentName: "Knowbee",
      steps: [
        {
          step_id: "capture",
          owner_agent_name: "Knowbee",
          action_type: "use_yeonjang",
          input_refs: ["capability:yeonjang_camera_capture"],
          expected_output: "A camera image artifact.",
          completion_criteria: "The image artifact is verified.",
          status: "pending",
        },
      ],
    }))

    const result = await planCanonicalSelfSolveCapabilities({
      runId: "run-camera-plan",
      intake: cameraIntake,
      policy,
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
      requiredCapabilityRefs: ["capability:yeonjang_camera_capture"],
      constraints: expect.arrayContaining([
        "target_instance:yeonjang-main",
        "approval_tool:yeonjang_camera_capture",
        "approved_capability:yeonjang_camera_capture",
      ]),
    }))
    expect(result).toMatchObject({
      ok: true,
      admission: {
        entries: [
          {
            capabilityId: "yeonjang_camera_capture",
            targetId: "yeonjang-main",
          },
        ],
      },
      scope: {
        ownerAgentId: "agent:knowbee",
        selectedTargetIds: ["yeonjang-main"],
      },
    })
  })

  it("uses the unique LLM-selected action binding before a generic owner fallback", async () => {
    const policy = {
      ...allowedPolicy,
      input: {
        ...allowedPolicy.input,
        constraints: {
          ...allowedPolicy.input.constraints,
          targetId: "yeonjang-main",
        },
        capabilitySnapshot: {
          ...allowedPolicy.input.capabilitySnapshot,
          bindings: [
            {
              capabilityId: "yeonjang_camera_capture",
              targetId: "agent:registered-owner",
              risk: "approval_required" as const,
            },
            {
              capabilityId: "yeonjang_status",
              targetId: "agent:knowbee",
              risk: "safe" as const,
            },
          ],
        },
      },
    }
    const planSolution = vi.fn(async (input: { capabilityRefs: string[] }) => ({
      ownerAgentName: "Knowbee",
      steps: [
        {
          step_id: "capture",
          owner_agent_name: "Knowbee",
          action_type: "use_yeonjang",
          input_refs: [input.capabilityRefs[0]],
          expected_output: "A camera image artifact.",
          completion_criteria: "The image artifact is verified.",
          status: "pending",
        },
      ],
    }))

    const result = await planCanonicalSelfSolveCapabilities({
      runId: "run-camera-plan",
      intake: cameraIntake,
      policy,
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
      requiredCapabilityRefs: ["capability:yeonjang_camera_capture"],
    }))
    expect(result).toMatchObject({
      ok: true,
      admission: {
        entries: [
          {
            capabilityId: "yeonjang_camera_capture",
            targetId: "yeonjang-main",
          },
        ],
      },
    })
  })

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

  it("preserves the LLM-selected action capability when prose approval clears the intake flag", async () => {
    const intake = {
      ...cameraIntake,
      execution: {
        ...cameraIntake.execution,
        execution_semantics: {
          ...cameraIntake.execution.execution_semantics,
          approvalRequired: false,
        },
      },
    }
    const policy = {
      ...allowedPolicy,
      input: {
        ...allowedPolicy.input,
        constraints: {
          ...allowedPolicy.input.constraints,
          approvedCapabilityIds: [],
        },
      },
    }
    const planSolution = vi.fn(async () => ({
      ownerAgentName: "Knowbee",
      steps: [
        {
          step_id: "capture",
          owner_agent_name: "Knowbee",
          action_type: "use_yeonjang",
          input_refs: ["capability:yeonjang_camera_capture"],
          expected_output: "A camera image artifact.",
          completion_criteria: "The image artifact is verified.",
          status: "pending",
        },
      ],
    }))

    const result = await planCanonicalSelfSolveCapabilities({
      runId: "run-camera-plan",
      intake,
      policy,
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
      requiredCapabilityRefs: ["capability:yeonjang_camera_capture"],
    }))
    expect(result).toMatchObject({
      ok: true,
      admission: {
        outcome: "approval_required",
        approvalRequiredCapabilityIds: ["yeonjang_camera_capture"],
      },
      scope: {
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
