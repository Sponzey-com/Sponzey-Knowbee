import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  LlmRequestDiagnosisRecord,
  LlmResultDiagnosisRecord,
} from "../packages/core/src/contracts/work-record.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  buildExampleEnterpriseTopology,
  createEnterpriseTopologyRegistry,
} from "../packages/core/src/index.ts"
import {
  type TopologyRootRunRoutingDecision,
  resolveTopologyRootRunRouting,
  runTopologyRootRun,
} from "../packages/core/src/topology-runtime/harness.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
const timestamp = Date.UTC(2026, 6, 16, 9, 0, 0)

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The request requires a topology execution plan.",
  intent: "execute_topology",
  goal: "Complete the requested work through the selected topology.",
  constraints: ["Use only capabilities admitted by the topology snapshot."],
  missing_information: [],
  risk: "unknown",
  confidence: "high",
  recommended_action: "plan",
  reason: "Execution requires explicit planned steps.",
}

const sufficientResultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The topology evidence satisfies the requested result.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The execution evidence proves the requested completion criteria.",
}

const retryResultDiagnosis: LlmResultDiagnosisRecord = {
  ...sufficientResultDiagnosis,
  diagnosis_summary: "The topology evidence is incomplete.",
  sufficiency: "insufficient",
  missing_information: ["Independent validation evidence"],
  risks: ["Reporting completion would overstate the available evidence."],
  confidence: "medium",
  recommended_action: "retry",
  reason: "A changed execution step must collect the missing validation evidence.",
}

const conflictingResultDiagnosis: LlmResultDiagnosisRecord = {
  ...sufficientResultDiagnosis,
  diagnosis_summary: "The topology outputs contain conflicting evidence.",
  conflicts: ["The reported value differs between two evidence sources."],
  confidence: "low",
  reason: "The conflict must be resolved before completion can be reported.",
}

function topologyFixture(): {
  registry: ReturnType<typeof createEnterpriseTopologyRegistry>
  decision: Extract<TopologyRootRunRoutingDecision, { mode: "route" }>
} {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task015-planning-"))
  tempDirs.push(rootDir)
  const runtime = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtime.paths.stateDir)

  const topology = buildExampleEnterpriseTopology(timestamp)
  const registry = createEnterpriseTopologyRegistry({ now: () => timestamp })
  registry.appendTopologyVersion({ topology, createdBy: "task015" })
  const decision = resolveTopologyRootRunRouting({
    message: "Handle this request through the topology.",
    runId: "run:task015",
    sessionId: "session:task015",
    source: "webui",
    isRootRequest: true,
    registry,
    orchestrationModeSnapshot: { mode: "orchestration", activeSubAgentCount: 1 },
    executionDecision: {
      contract_version: "agent-execution-decision:v1",
      current_executor_id: "agent:knowbee",
      domain: "topology",
      behavior_pattern: "plan",
      execution_route: "delegate_to_child",
      selected_executor_id: "node:intake",
      selected_connection_path: ["node:intake"],
      task_profile: {
        title: "Topology execution",
        summary: "Plan and execute topology work.",
        goals: ["Complete the request."],
        task_units: [],
        success_criteria: ["A verified answer is produced."],
      },
      required_outputs: [],
      risk_boundary: { requires_user_approval: false, reason: "Read-only fixture." },
      confidence: 1,
      fallback_if_unavailable: "boundary_failure",
      reason: "The selected topology is available.",
    },
  })
  if (decision.mode !== "route") throw new Error(`Expected route, got ${decision.reasonCode}`)
  return { registry, decision }
}

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task015 topology LLM planning admission", () => {
  it("executes only after request diagnosis and a valid LLM plan receipt", async () => {
    const { registry, decision } = topologyFixture()
    const calls: string[] = []
    const result = await runTopologyRootRun({
      decision,
      runId: "run:task015",
      sessionId: "session:task015",
      source: "webui",
      message: "Handle this request through the topology.",
      registry,
      now: () => timestamp,
      planningAdmission: {
        required: true,
        diagnosisProvider: {
          diagnoseRequest: async () => {
            calls.push("diagnosis")
            return requestDiagnosis
          },
          diagnoseResult: async () => sufficientResultDiagnosis,
        },
        diagnosisRepairProvider: {
          repairDiagnosis: async () => requestDiagnosis,
        },
        solutionPlanProvider: {
          planSolution: async (input) => {
            calls.push(`plan:${input.requestDiagnosisReceiptId}`)
            return {
              ownerAgentName: input.ownerAgentName,
              steps: [
                {
                  step_id: "inspect",
                  owner_agent_name: input.ownerAgentName,
                  action_type: "use_tool",
                  input_refs: ["request:user", input.capabilityRefs[0] as string],
                  expected_output: "Capability evidence",
                  completion_criteria: "Evidence is available for review.",
                  status: "pending",
                },
                {
                  step_id: "validate",
                  owner_agent_name: input.ownerAgentName,
                  action_type: "validate",
                  input_refs: ["step:inspect"],
                  expected_output: "Verified answer",
                  completion_criteria: "The requested result is verified.",
                  status: "pending",
                },
              ],
            }
          },
        },
      },
      onPlanningAdmitted: (receiptRefs) => {
        expect(receiptRefs.capabilitySelections).toEqual([
          {
            stepId: "inspect",
            capabilityRef: expect.stringMatching(/^capability:/u),
          },
        ])
        calls.push(`admitted:${receiptRefs.solutionPlanReceiptId}`)
        return { ok: true }
      },
      resultDiagnosisAdmission: {
        required: true,
        diagnosisProvider: {
          diagnoseRequest: async () => requestDiagnosis,
          diagnoseResult: async () => {
            calls.push("result-diagnosis")
            return sufficientResultDiagnosis
          },
        },
        diagnosisRepairProvider: { repairDiagnosis: async () => sufficientResultDiagnosis },
      },
      onResultDiagnosed: ({ resultDiagnosisReceiptId }) => {
        calls.push(`result-admitted:${resultDiagnosisReceiptId}`)
        return { ok: true }
      },
    })

    expect(result.ok).toBe(true)
    expect(calls[0]).toBe("diagnosis")
    expect(calls[1]).toMatch(/^plan:diagnosis:/u)
    expect(calls[2]).toMatch(/^admitted:receipt:solution-plan:/u)
    expect(calls[3]).toBe("result-diagnosis")
    expect(calls[4]).toMatch(/^result-admitted:diagnosis:/u)
  })

  it("rejects topology completion when LLM result diagnosis requires a retry", async () => {
    const { registry, decision } = topologyFixture()
    let clock = timestamp
    const result = await runTopologyRootRun({
      decision,
      runId: "run:task017-insufficient",
      sessionId: "session:task017-insufficient",
      source: "webui",
      message: "Handle this request through the topology.",
      registry,
      now: () => ++clock,
      planningAdmission: {
        required: true,
        diagnosisProvider: {
          diagnoseRequest: async () => requestDiagnosis,
          diagnoseResult: async () => sufficientResultDiagnosis,
        },
        diagnosisRepairProvider: { repairDiagnosis: async () => requestDiagnosis },
        solutionPlanProvider: {
          planSolution: async (input) => ({
            ownerAgentName: input.ownerAgentName,
            steps: [
              {
                step_id: "inspect",
                owner_agent_name: input.ownerAgentName,
                action_type: "use_tool",
                input_refs: ["request:user", input.capabilityRefs[0] as string],
                expected_output: "Capability evidence",
                completion_criteria: "Evidence is available for review.",
                status: "pending",
              },
              {
                step_id: "validate",
                owner_agent_name: input.ownerAgentName,
                action_type: "validate",
                input_refs: ["step:inspect"],
                expected_output: "Verified answer",
                completion_criteria: "The requested result is verified.",
                status: "pending",
              },
            ],
          }),
        },
      },
      onPlanningAdmitted: () => ({ ok: true }),
      resultDiagnosisAdmission: {
        required: true,
        diagnosisProvider: {
          diagnoseRequest: async () => requestDiagnosis,
          diagnoseResult: async () => retryResultDiagnosis,
        },
        diagnosisRepairProvider: { repairDiagnosis: async () => retryResultDiagnosis },
      },
      onResultDiagnosed: () => ({ ok: true }),
    })

    expect(result).toMatchObject({
      ok: false,
      reasonCode: "result_diagnosis_reanalysis_required",
      issues: expect.arrayContaining([
        "result_diagnosis_action:retry",
        "result_sufficiency:insufficient",
      ]),
    })
  })

  it.each([
    {
      name: "conflicting evidence",
      diagnoseResult: async () => conflictingResultDiagnosis,
      repairDiagnosis: vi.fn(async () => conflictingResultDiagnosis),
      expectedIssue: "result_diagnosis_conflicts",
    },
    {
      name: "invalid typed output",
      diagnoseResult: async () => ({}) as never,
      repairDiagnosis: vi.fn(async () => ({}) as never),
      expectedIssue: "result_diagnosis_invalid",
    },
  ])("rejects topology completion for $name", async (testCase) => {
    const { registry, decision } = topologyFixture()
    let clock = timestamp
    const result = await runTopologyRootRun({
      decision,
      runId: `run:task017-${testCase.name.replaceAll(" ", "-")}`,
      sessionId: "session:task017-rejection",
      source: "webui",
      message: "Handle this request through the topology.",
      registry,
      now: () => ++clock,
      planningAdmission: {
        required: true,
        diagnosisProvider: {
          diagnoseRequest: async () => requestDiagnosis,
          diagnoseResult: async () => sufficientResultDiagnosis,
        },
        diagnosisRepairProvider: { repairDiagnosis: async () => requestDiagnosis },
        solutionPlanProvider: {
          planSolution: async (input) => ({
            ownerAgentName: input.ownerAgentName,
            steps: [
              {
                step_id: "inspect",
                owner_agent_name: input.ownerAgentName,
                action_type: "use_tool",
                input_refs: ["request:user", input.capabilityRefs[0] as string],
                expected_output: "Capability evidence",
                completion_criteria: "Evidence is available for review.",
                status: "pending",
              },
              {
                step_id: "validate",
                owner_agent_name: input.ownerAgentName,
                action_type: "validate",
                input_refs: ["step:inspect"],
                expected_output: "Verified answer",
                completion_criteria: "The requested result is verified.",
                status: "pending",
              },
            ],
          }),
        },
      },
      onPlanningAdmitted: () => ({ ok: true }),
      resultDiagnosisAdmission: {
        required: true,
        diagnosisProvider: {
          diagnoseRequest: async () => requestDiagnosis,
          diagnoseResult: testCase.diagnoseResult,
        },
        diagnosisRepairProvider: { repairDiagnosis: testCase.repairDiagnosis },
      },
      onResultDiagnosed: () => ({ ok: true }),
    })

    expect(result).toMatchObject({
      ok: false,
      reasonCode: "result_diagnosis_reanalysis_required",
      issues: expect.arrayContaining([testCase.expectedIssue]),
    })
    expect(testCase.repairDiagnosis).not.toHaveBeenCalled()
  })

  it("blocks before node execution when the LLM plan is invalid", async () => {
    const { registry, decision } = topologyFixture()
    const selfExecute = vi.fn()
    let clock = timestamp
    const repairSolutionPlan = vi.fn(async () => ({ steps: [] }))
    const result = await runTopologyRootRun({
      decision,
      runId: "run:task015-invalid",
      sessionId: "session:task015-invalid",
      source: "webui",
      message: "Handle this request through the topology.",
      registry,
      now: () => ++clock,
      selfExecute,
      planningAdmission: {
        required: true,
        diagnosisProvider: {
          diagnoseRequest: async () => requestDiagnosis,
          diagnoseResult: async () => requestDiagnosis,
        },
        diagnosisRepairProvider: { repairDiagnosis: async () => requestDiagnosis },
        solutionPlanProvider: { planSolution: async () => ({ steps: [] }) },
        solutionPlanRepairProvider: {
          repairSolutionPlan,
        },
      },
    })

    expect(result).toMatchObject({
      ok: false,
      reasonCode: "planning_admission_blocked",
      issues: ["invalid_solution_plan_output"],
    })
    expect(selfExecute).not.toHaveBeenCalled()
    expect(repairSolutionPlan).not.toHaveBeenCalled()
  })

  it("blocks required admission when a provider is unavailable", async () => {
    const { registry, decision } = topologyFixture()
    const selfExecute = vi.fn()
    const result = await runTopologyRootRun({
      decision,
      runId: "run:task015-missing",
      sessionId: "session:task015-missing",
      source: "webui",
      message: "Handle this request through the topology.",
      registry,
      selfExecute,
      planningAdmission: { required: true },
    })

    expect(result).toMatchObject({
      ok: false,
      reasonCode: "planning_admission_blocked",
      issues: ["planning_provider_missing"],
    })
    expect(selfExecute).not.toHaveBeenCalled()
  })

  it("blocks before node execution when canonical planning persistence rejects the receipts", async () => {
    const { registry, decision } = topologyFixture()
    const selfExecute = vi.fn()
    let clock = timestamp
    const result = await runTopologyRootRun({
      decision,
      runId: "run:task016-persistence",
      sessionId: "session:task016-persistence",
      source: "webui",
      message: "Handle this request through the topology.",
      registry,
      now: () => ++clock,
      selfExecute,
      planningAdmission: {
        required: true,
        diagnosisProvider: {
          diagnoseRequest: async () => requestDiagnosis,
          diagnoseResult: async () => requestDiagnosis,
        },
        diagnosisRepairProvider: { repairDiagnosis: async () => requestDiagnosis },
        solutionPlanProvider: {
          planSolution: async (input) => ({
            ownerAgentName: input.ownerAgentName,
            steps: [
              {
                step_id: "inspect",
                owner_agent_name: input.ownerAgentName,
                action_type: "use_tool",
                input_refs: ["request:user", input.capabilityRefs[0] as string],
                expected_output: "Capability evidence",
                completion_criteria: "Evidence is available for review.",
                status: "pending",
              },
              {
                step_id: "validate",
                owner_agent_name: input.ownerAgentName,
                action_type: "validate",
                input_refs: ["step:inspect"],
                expected_output: "Verified answer",
                completion_criteria: "The requested result is verified.",
                status: "pending",
              },
            ],
          }),
        },
      },
      onPlanningAdmitted: async () => ({
        ok: false,
        reasonCode: "canonical_planning_persistence_failed",
      }),
    })

    expect(result).toMatchObject({
      ok: false,
      reasonCode: "planning_admission_blocked",
      issues: ["canonical_planning_persistence_failed"],
    })
    expect(selfExecute).not.toHaveBeenCalled()
  })
})
