import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import {
  ExecutorRunResultPanel,
  buildExecutorRunResultModel,
} from "../packages/webui/src/components/topology/ExecutorRunResultPanel.tsx"
import type { TopologyRunTraceOverlayInput } from "../packages/webui/src/components/topology/TopologyRunTraceOverlay.tsx"

const now = Date.UTC(2026, 6, 6, 3, 0, 0)

function overlayWithUnmappedNodeIds(): TopologyRunTraceOverlayInput {
  return {
    run: {
      topologyRunId: "topology-run:task0377",
      topologyId: "topology:task0377",
      status: "failed",
      entryNodeId: "node:private-entry-task0377",
      startedAt: now,
      finishedAt: now + 1000,
      createdAt: now,
      updatedAt: now + 1000,
    },
    traceEvents: [
      {
        traceEventId: "trace:task0377",
        topologyRunId: "topology-run:task0377",
        nodeRunId: "node-run:task0377",
        workOrderId: "work-order:task0377",
        parentWorkOrderId: null,
        delegationPath: ["node:private-entry-task0377", "node:private-failed-task0377"],
        phase: "exhaustion",
        component: "runtime",
        at: now + 1,
        reasonCode: "final_failure_after_exhaustion",
        sequence: 1,
        event: {
          schemaVersion: 1,
          traceEventId: "trace:task0377",
          topologyRunId: "topology-run:task0377",
          nodeRunId: "node-run:task0377",
          workOrderId: "work-order:task0377",
          parentWorkOrderId: null,
          delegationPath: ["node:private-entry-task0377", "node:private-failed-task0377"],
          phase: "exhaustion",
          component: "runtime",
          at: now + 1,
          reasonCode: "final_failure_after_exhaustion",
        },
      },
    ],
    toolCalls: [],
    failureReports: [
      {
        failureReportId: "failure:task0377",
        topologyRunId: "topology-run:task0377",
        nodeRunId: "node-run:task0377",
        workOrderId: "work-order:task0377",
        nodeId: "node:private-failed-task0377",
        failurePhase: "exhaustion",
        report: {
          schemaVersion: 1,
          failureReportId: "failure:task0377",
          topologyRunId: "topology-run:task0377",
          nodeRunId: "node-run:task0377",
          workOrderId: "work-order:task0377",
          nodeId: "node:private-failed-task0377",
          exhaustionSummary: {
            selfExecutionAttempted: true,
            childDelegationAttempted: false,
            toolExecutionAttempted: false,
            retryAttempted: true,
            fallbackAttempted: false,
            partialSuccessChecked: true,
            parentRecoveryPossibleChecked: true,
            successCriteriaStillNotMet: true,
            complete: true,
          },
          attempts: [],
          untriedOptions: [],
          issueKind: "success_criteria_unmet",
          recoveryActionKind: "add_fallback_path",
          nextActionKind: "add_fallback",
          recommendedAction: "Review retry and fallback candidates",
          createdAt: now + 2,
        },
        createdAt: now + 2,
      },
    ],
    observedEdges: [],
    gapFindings: [],
  }
}

describe("task0377 executor result node ID redaction", () => {
  it("uses generic sub-agent labels for unmapped failure nodes in the default result screen", () => {
    const overlay = overlayWithUnmappedNodeIds()
    const model = buildExecutorRunResultModel({ overlay })
    const html = renderToStaticMarkup(
      createElement(ExecutorRunResultPanel, {
        overlay,
      }),
    )

    expect(model.failures[0]?.pathKo).toBe("서브 에이전트 -> 서브 에이전트")
    expect(model.failures[0]?.nodeName).toBe("서브 에이전트")
    expect(html).toContain("서브 에이전트")
    expect(html).not.toContain("node:private-entry-task0377")
    expect(html).not.toContain("node:private-failed-task0377")
  })
})
