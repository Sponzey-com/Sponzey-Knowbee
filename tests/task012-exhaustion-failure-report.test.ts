import { describe, expect, it } from "vitest"
import {
  buildExampleEnterpriseTopology,
  buildWorkOrder,
  compileTopologyOrThrow,
  createWorkOrderRuntimeEnvelope,
  runNodeRuntime,
  validateFailureReport,
  validateNodeResultReport,
  type CompiledTopologySnapshot,
  type EnterpriseTopology,
  type NodeContract,
  type NodeResultOutput,
  type WorkOrder,
  type WorkOrderRuntimeEnvelope,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 3, 29, 7, 0, 0)

const exhaustionDiagnosisProvider = {
  diagnoseRequest: () => ({
    diagnosis_summary: "The request requires execution.", intent: "execute", goal: "Complete work.",
    constraints: [], missing_information: [], risk: "low", confidence: "high",
    recommended_action: "plan", reason: "Execution planning is required.",
  }),
  diagnoseResult: () => ({
    diagnosis_summary: "All recovery paths are exhausted.", sufficiency: "insufficient",
    missing_information: [], conflicts: [], risk: "low", risks: [], confidence: "high",
    recommended_action: "stop_blocked", reason: "No justified recovery path remains.",
  }),
  repairDiagnosis: () => ({
    diagnosis_summary: "All recovery paths are exhausted.", sufficiency: "insufficient",
    missing_information: [], conflicts: [], risk: "low", risks: [], confidence: "high",
    recommended_action: "stop_blocked", reason: "No justified recovery path remains.",
  }),
}

function topologyFixture(): EnterpriseTopology {
  const topology = structuredClone(buildExampleEnterpriseTopology(now))
  topology.status = "active"
  topology.nodes = topology.nodes.map((node) => ({ ...node, status: "active" }))
  return topology
}

function compiledFixture(topology = topologyFixture()): CompiledTopologySnapshot {
  return compileTopologyOrThrow(topology, {
    sourceTopologyVersion: "task012",
    compiledAt: now,
  })
}

function nodeById(topology: EnterpriseTopology, nodeId: string): NodeContract {
  const node = topology.nodes.find((candidate) => candidate.id === nodeId)
  if (node === undefined) throw new Error(`expected node ${nodeId}`)
  return node
}

function workOrderFixture(overrides: Partial<WorkOrder> = {}): WorkOrder {
  const order = buildWorkOrder({
    workOrderId: "work-order:intake",
    topologyRunId: "topology-run:task012",
    parentWorkOrderId: null,
    fromNodeId: "node:knowbee",
    to: { type: "node", id: "node:intake" },
    objective: "Triage the customer request and assign priority.",
    scope: {
      included: ["customer request", "CRM account context"],
      excluded: ["billing write actions"],
    },
    input: {
      requestId: "request:001",
      customerId: "customer:alpha",
    },
    expectedOutputSchema: {
      kind: "object",
      required: ["summary", "priority"],
    },
    successCriteria: [
      {
        criterionId: "criterion:priority",
        description: "Priority is assigned with a supporting reason.",
        required: true,
        validationKind: "manual",
      },
    ],
    permissionScope: {
      allowedToolIds: ["tool:crm-search"],
      allowedSystemIds: ["system:crm"],
      dataDomainIds: ["data:customer"],
      riskLevel: "medium",
    },
    authorityScope: {
      requiredAuthorityRuleIds: [],
      approvalRequired: false,
    },
    failureReportRequired: true,
    delegationPath: ["node:knowbee", "node:intake"],
    createdAt: now,
  })

  return {
    ...order,
    ...overrides,
  }
}

function runtimeEnvelope(input: {
  topology?: EnterpriseTopology
  compiled?: CompiledTopologySnapshot
  node?: NodeContract
  workOrder?: WorkOrder
} = {}): {
  topology: EnterpriseTopology
  compiled: CompiledTopologySnapshot
  workOrder: WorkOrder
  envelope: WorkOrderRuntimeEnvelope
} {
  const topology = input.topology ?? topologyFixture()
  const compiled = input.compiled ?? compiledFixture(topology)
  const workOrder = input.workOrder ?? workOrderFixture()
  const node = input.node ?? nodeById(topology, workOrder.to.id)
  const result = createWorkOrderRuntimeEnvelope({
    workOrder,
    nodeContractSnapshot: node,
    compiledTopologySnapshot: compiled,
    commandRequestId: "command:task012",
    subSessionId: "sub-session:task012",
    now: () => now,
  })

  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error("expected runtime envelope")
  return { topology, compiled, workOrder, envelope: result.envelope }
}

function failedSelfExecution() {
  return {
    status: "failed_candidate" as const,
    outputs: [] satisfies NodeResultOutput[],
    risksOrGaps: ["missing account context"],
    reasonCode: "self_execution_failed_candidate",
  }
}

const everythingReviewed = {
  childDelegationAttempted: true,
  toolExecutionAttempted: true,
  retryAttempted: true,
  fallbackAttempted: true,
  partialSuccessChecked: true,
  parentRecoveryPossibleChecked: true,
  diagnosisProvider: exhaustionDiagnosisProvider,
  diagnosisRepairProvider: exhaustionDiagnosisProvider,
  solutionPathReviews: [
    { path: "direct_answer", disposition: "reviewed_unavailable", reasonCode: "task_requires_execution" },
    { path: "plan", disposition: "attempted", reasonCode: "plan_executed" },
    { path: "tool", disposition: "attempted", reasonCode: "tool_failed" },
    { path: "sub_agent", disposition: "reviewed_unavailable", reasonCode: "no_capable_child" },
    { path: "yeonjang", disposition: "reviewed_unavailable", reasonCode: "not_required" },
    { path: "ask_clarification", disposition: "reviewed_unavailable", reasonCode: "input_complete" },
    {
      path: "partial_completion",
      disposition: "completed_partial",
      reasonCode: "summary_preserved",
      resultRefs: ["output:summary"],
    },
    {
      path: "workaround_guidance",
      disposition: "guidance_ready",
      reasonCode: "manual_escalation_available",
      guidance: "Escalate with the preserved partial summary.",
    },
  ] as const,
}

describe("task012 Recovery, Re-delegation, Exhaustion Checker", () => {
  it("blocks final failed when self execution has not been attempted", async () => {
    const topology = topologyFixture()
    const compiled = compiledFixture(topology)
    const node = {
      ...nodeById(topology, "node:intake"),
      metadata: {
        inputSchema: {
          type: "object",
          required: ["customerId"],
          properties: {
            customerId: { type: "string" },
          },
        },
      },
    } satisfies NodeContract
    const { envelope } = runtimeEnvelope({
      topology,
      compiled,
      node,
      workOrder: workOrderFixture({
        input: {
          requestId: "request:001",
        },
      }),
    })

    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:self-untried",
      now: () => now,
      recovery: {
        enabled: true,
        ...everythingReviewed,
      },
    })

    expect(result.status).toBe("failed_candidate")
    expect(result.finalState).toBe("failed_candidate")
    expect(result.failureReport).toBeUndefined()
    expect(result.exhaustion?.blockingUntriedOptions).toContain("self_execution:self_execution_untried")
    expect(result.exhaustion?.canFinalizeFailure).toBe(false)
    expect(result.stateTransitions.map((transition) => transition.state)).not.toContain("failed")
  })

  it("blocks final failed when child delegation has not been reviewed", async () => {
    const { compiled, envelope } = runtimeEnvelope()

    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:child-unreviewed",
      now: () => now,
      selfExecute: failedSelfExecution,
      recovery: {
        enabled: true,
        toolExecutionAttempted: true,
        retryAttempted: true,
        fallbackAttempted: true,
        partialSuccessChecked: true,
        parentRecoveryPossibleChecked: true,
      },
    })

    expect(result.status).toBe("failed_candidate")
    expect(result.failureReport).toBeUndefined()
    expect(result.exhaustion?.blockingUntriedOptions).toContain("child_delegation:child_delegation_untried")
    expect(result.nodeResultReport.risksOrGaps).toEqual(
      expect.arrayContaining(["untried_option:child_delegation:child_delegation_untried"]),
    )
  })

  it("blocks final failed when tool possibilities have not been reviewed", async () => {
    const { compiled, envelope } = runtimeEnvelope()

    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:tool-unreviewed",
      now: () => now,
      selfExecute: failedSelfExecution,
      recovery: {
        enabled: true,
        childDelegationAttempted: true,
        retryAttempted: true,
        fallbackAttempted: true,
        partialSuccessChecked: true,
        parentRecoveryPossibleChecked: true,
      },
    })

    expect(result.status).toBe("failed_candidate")
    expect(result.failureReport).toBeUndefined()
    expect(result.exhaustion?.blockingUntriedOptions).toContain("tool_execution:tool_execution_untried")
  })

  it("blocks final failed when partial success has not been checked", async () => {
    const { compiled, envelope } = runtimeEnvelope()

    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:partial-unreviewed",
      now: () => now,
      selfExecute: failedSelfExecution,
      recovery: {
        enabled: true,
        childDelegationAttempted: true,
        toolExecutionAttempted: true,
        retryAttempted: true,
        fallbackAttempted: true,
        parentRecoveryPossibleChecked: true,
      },
    })

    expect(result.status).toBe("failed_candidate")
    expect(result.failureReport).toBeUndefined()
    expect(result.exhaustion?.blockingUntriedOptions).toContain("partial_success_review:partial_success_unchecked")
  })

  it("records untried recovery options for operator review", async () => {
    const { compiled, envelope } = runtimeEnvelope()

    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:untried-options",
      now: () => now,
      selfExecute: failedSelfExecution,
      recovery: {
        enabled: true,
      },
    })

    expect(result.recovery?.untriedOptions).toEqual(
      expect.arrayContaining([
        "child_delegation:child_delegation_untried",
        "tool_execution:tool_execution_untried",
        "retry:retry_untried",
        "fallback:fallback_untried",
        "partial_success_review:partial_success_unchecked",
        "parent_recovery:parent_recovery_unchecked",
      ]),
    )
    expect(result.exhaustion?.complete).toBe(false)
  })

  it("generates final FailureReport only after exhaustion is complete and success criteria remain unmet", async () => {
    const { compiled, envelope } = runtimeEnvelope()

    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:final-failure",
      now: () => now,
      selfExecute: failedSelfExecution,
      recovery: {
        enabled: true,
        ...everythingReviewed,
        recommendedAction: "Escalate to the customer success lead with the failed WorkOrder trace.",
      },
    })

    expect(result.status).toBe("failed")
    expect(result.finalState).toBe("failed")
    expect(result.exhaustion).toMatchObject({
      complete: true,
      canFinalizeFailure: true,
      successCriteriaStillNotMet: true,
      unmetSuccessCriteriaIds: ["criterion:priority"],
    })
    expect(result.failureReport).toMatchObject({
      failureReportId: "failure:work-order:intake",
      nodeRunId: "node-run:final-failure",
      workOrderId: "work-order:intake",
      nodeId: "node:intake",
      untriedOptions: [],
      recommendedAction: "Escalate to the customer success lead with the failed WorkOrder trace.",
      partialResultRefs: ["output:summary"],
      workaroundGuidance: ["Escalate with the preserved partial summary."],
    })
    expect(result.nodeResultReport.failureReportId).toBe(result.failureReport?.failureReportId)
    expect(result.terminalStopDecision).toMatchObject({
      status: "stop_and_report",
      reasonCode: "solution_paths_exhausted",
      reportInput: {
        goalId: "work-order:intake",
        unresolvedItemIds: ["criterion:priority"],
        partialResultRefs: ["output:summary"],
        evidenceRefs: expect.arrayContaining([
          "solution-path-review:direct_answer:reviewed_unavailable",
          "solution-path-review:plan:attempted",
          "solution-path-review:tool:attempted",
          "attempt-strategy:plan:work-order:intake:plan_executed",
          "attempt-strategy:tool:work-order:intake:tool_failed",
        ]),
      },
    })
    expect(result.stateTransitions.map((transition) => transition.state)).toEqual(
      expect.arrayContaining(["exhaustion_checking", "failed"]),
    )
    expect(validateFailureReport(result.failureReport).ok).toBe(true)
    expect(validateNodeResultReport(result.nodeResultReport).ok).toBe(true)
  })

  it("keeps an exhausted failure non-terminal without an LLM diagnosis authorization", async () => {
    const { compiled, envelope } = runtimeEnvelope()
    const {
      diagnosisProvider: _diagnosisProvider,
      diagnosisRepairProvider: _diagnosisRepairProvider,
      ...recoveryWithoutDiagnosis
    } = everythingReviewed

    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:diagnosis-missing",
      now: () => now,
      selfExecute: failedSelfExecution,
      recovery: { enabled: true, ...recoveryWithoutDiagnosis },
    })

    expect(result.status).toBe("failed_candidate")
    expect(result.failureReport).toBeUndefined()
    expect(result.nodeResultReport.risksOrGaps).toContain("final_failure_diagnosis_authorization_missing")
    expect(result.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ reasonCode: "final_failure_diagnosis_guard_blocked" }),
    ]))
  })

  it("keeps final failure non-terminal while a reviewed direct-answer path remains available", async () => {
    const { compiled, envelope } = runtimeEnvelope()
    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:answer-available",
      now: () => now,
      selfExecute: failedSelfExecution,
      recovery: {
        enabled: true,
        ...everythingReviewed,
        solutionPathReviews: everythingReviewed.solutionPathReviews.map((review) => review.path === "direct_answer"
          ? { path: "direct_answer", disposition: "available", reasonCode: "answer_ready" } as const
          : review),
      },
    })

    expect(result.status).toBe("failed_candidate")
    expect(result.failureReport).toBeUndefined()
    expect(result.exhaustion).toMatchObject({ complete: true, canFinalizeFailure: false })
    expect(result.exhaustion?.reasonCodes).toContain("solution_path_still_available")
  })

  it("projects an evidenced non-recoverable self-execution condition as concrete impossibility", async () => {
    const { compiled, envelope } = runtimeEnvelope()
    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:impossible",
      now: () => now,
      selfExecute: () => ({
        ...failedSelfExecution(),
        impossibility: {
          reasonCode: "account_deleted",
          verifiedFacts: ["The target account has a verified deletion receipt."],
          evidenceRefs: ["crm:tombstone:1"],
          recoverable: false,
          requiredChanges: [],
        },
      }),
      recovery: { enabled: true, ...everythingReviewed },
    })

    expect(result.status).toBe("failed")
    expect(result.terminalStopDecision).toMatchObject({
      status: "stop_and_report",
      reasonCode: "concrete_impossibility",
      reportInput: { evidenceRefs: expect.arrayContaining(["crm:tombstone:1"]) },
    })
  })

  it("keeps a recoverable impossibility non-terminal until the required change occurs", async () => {
    const { compiled, envelope } = runtimeEnvelope()
    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:recoverable-condition",
      now: () => now,
      selfExecute: () => ({
        ...failedSelfExecution(),
        impossibility: {
          reasonCode: "account_temporarily_locked",
          verifiedFacts: ["The account lock is active."],
          evidenceRefs: ["crm:lock:1"],
          recoverable: true,
          requiredChanges: ["Wait for or remove the account lock."],
        },
      }),
      recovery: { enabled: true, ...everythingReviewed },
    })

    expect(result.status).toBe("failed_candidate")
    expect(result.failureReport).toBeUndefined()
    expect(result.terminalStopDecision).toBeUndefined()
    expect(result.nodeResultReport.risksOrGaps).toContain("recoverable_condition")
  })

  it("keeps an exhausted failure non-terminal when LLM diagnosis is unavailable", async () => {
    const { compiled, envelope } = runtimeEnvelope()
    const unavailableProvider = {
      diagnoseRequest: () => { throw new Error("provider unavailable") },
      diagnoseResult: () => { throw new Error("provider unavailable") },
      repairDiagnosis: () => { throw new Error("provider unavailable") },
    }
    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:diagnosis-unavailable",
      now: () => now,
      selfExecute: failedSelfExecution,
      recovery: {
        enabled: true,
        ...everythingReviewed,
        diagnosisProvider: unavailableProvider,
        diagnosisRepairProvider: unavailableProvider,
      },
    })

    expect(result.status).toBe("failed_candidate")
    expect(result.failureReport).toBeUndefined()
    expect(result.traceEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ reasonCode: "final_failure_diagnosis_unavailable" }),
      expect.objectContaining({ reasonCode: "final_failure_diagnosis_guard_blocked" }),
    ]))
  })

  it("blocks final failure when explicit solution-path review is missing", async () => {
    const { compiled, envelope } = runtimeEnvelope()

    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:solution-path-unreviewed",
      now: () => now,
      selfExecute: failedSelfExecution,
      recovery: {
        enabled: true,
        childDelegationAttempted: true,
        toolExecutionAttempted: true,
        retryAttempted: true,
        fallbackAttempted: true,
        partialSuccessChecked: true,
        parentRecoveryPossibleChecked: true,
      },
    })

    expect(result.status).toBe("failed_candidate")
    expect(result.failureReport).toBeUndefined()
    expect(result.exhaustion?.canFinalizeFailure).toBe(false)
    expect(result.exhaustion?.solutionPathAssessment.missingPaths).toEqual([
      "direct_answer",
      "plan",
      "tool",
      "sub_agent",
      "yeonjang",
      "ask_clarification",
      "partial_completion",
      "workaround_guidance",
    ])
  })

  it("promotes observed partial outputs into structured failure-report references", async () => {
    const { compiled, envelope } = runtimeEnvelope()
    const result = await runNodeRuntime({
      envelope,
      compiledTopologySnapshot: compiled,
      nodeRunId: "node-run:observed-partial",
      now: () => now,
      selfExecute: async () => ({
        ...failedSelfExecution(),
        outputs: [{ outputId: "criterion:priority", status: "partial", value: "P2 without evidence" }],
      }),
      recovery: {
        enabled: true,
        ...everythingReviewed,
        solutionPathReviews: everythingReviewed.solutionPathReviews.map((review) => review.path === "partial_completion"
          ? { path: "partial_completion", disposition: "reviewed_unavailable", reasonCode: "pre_execution_review" } as const
          : review),
      },
    })

    expect(result.status).toBe("failed")
    expect(result.failureReport?.partialResultRefs).toEqual(["criterion:priority"])
  })
})
