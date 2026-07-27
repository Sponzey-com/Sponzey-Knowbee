import { buildOrchestrationPlan } from "../../packages/core/src/orchestration/planner.ts"
import { resolveOrchestrationModeSnapshot } from "../../packages/core/src/orchestration/mode.ts"
import { resolveTopologyRootRunRouting } from "../../packages/core/src/topology-runtime/harness.ts"
import type { StartPlanDependencies } from "../../packages/core/src/runs/start-plan.ts"

export type TestStartPlanBoundaryDependencies = Pick<
  StartPlanDependencies,
  "resolveOrchestrationMode" | "buildOrchestrationPlan" | "resolveTopologyRootRunRouting"
>

export function createTestStartPlanBoundaryDependencies(): TestStartPlanBoundaryDependencies {
  return Object.freeze({
    resolveOrchestrationMode: (input) => resolveOrchestrationModeSnapshot({
      ...input,
      loadRegistry: () => ({
        activeSubAgents: [],
        totalSubAgentCount: 0,
        disabledSubAgentCount: 0,
      }),
      now: () => 0,
    }),
    buildOrchestrationPlan: (input) => buildOrchestrationPlan({
      ...input,
      now: () => 0,
      idProvider: () => `test-plan:${input.parentRunId}`,
    }),
    resolveTopologyRootRunRouting: (input) => resolveTopologyRootRunRouting({
      ...input,
      featureFlag: {
        featureKey: "topology_runtime_enabled",
        mode: "off",
        compatibilityMode: true,
        updatedAt: 0,
        updatedBy: "test-fixture",
        reason: "Topology routing is disabled for isolated start-plan tests.",
        evidence: null,
        source: "default",
      },
    }),
  })
}
