import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import type { RunRuntimeInspectorProjection } from "../packages/webui/src/contracts/runs.ts"
import { RunRuntimeInspectorPanel } from "../packages/webui/src/components/runs/RunRuntimeInspectorPanel.tsx"

function projectionWithUnmappedInternalIds(): RunRuntimeInspectorProjection {
  const now = Date.UTC(2026, 6, 6, 2, 0, 0)
  return {
    schemaVersion: 1,
    runId: "run:task0371",
    requestGroupId: "group:task0371",
    requestIdentity: {
      runId: "run:task0371",
      requestGroupId: "group:task0371",
      rootRunId: "run:task0371",
    },
    generatedAt: now,
    orchestrationMode: "orchestration",
    topologyRouting: {
      mode: "route",
      providerFallbackBlocked: false,
      providerFallback: false,
      selectedExecutorIds: [],
      selectedEdgeIds: [],
      assignedTopologyAgentIds: [],
      issues: [],
    },
    plan: {
      directTaskCount: 0,
      delegatedTaskCount: 1,
      approvalRequirementCount: 0,
      resourceLockCount: 0,
      parallelGroupCount: 0,
      taskSummaries: [
        {
          taskId: "task:task0371",
          executionKind: "delegated_sub_agent",
          goal: "Check that unmapped runtime identifiers stay hidden",
          assignedExecutorId: "executor:private-task0371",
          assignedAgentId: "agent:private-task0371",
          assignmentSource: "topology",
          reasonCodes: ["task0371"],
        },
      ],
    },
    subSessions: [],
    dataExchanges: [],
    approvals: [],
    timeline: [],
    topologyRuns: [
      {
        topologyRunId: "topology-run:task0371",
        topologyId: "topology:task0371",
        status: "running",
        entryNodeId: "node:private-entry-task0371",
        startedAt: now,
        nodeRunCount: 1,
        workOrderCount: 1,
        traceEventCount: 1,
        toolCallCount: 0,
        failureCount: 0,
        observedEdgeCount: 0,
        projection: {},
      },
    ],
    finalizer: {
      parentOwnedFinalAnswer: true,
      status: "not_started",
    },
    redaction: {
      payloadsRedacted: true,
      rawPayloadVisible: false,
    },
  }
}

describe("task0371 runtime inspector ID fallback redaction", () => {
  it("uses generic user-facing labels instead of unmapped executor and entry node ids", () => {
    const html = renderToStaticMarkup(
      createElement(RunRuntimeInspectorPanel, {
        projection: projectionWithUnmappedInternalIds(),
        selectedSubSessionId: null,
        onSelectSubSession: () => undefined,
        loading: false,
        error: "",
      }),
    )

    expect(html).toContain("서브 에이전트 위임")
    expect(html).toContain("서브 에이전트")
    expect(html).toContain("시작 서브 에이전트")
    expect(html).not.toContain("executor:private-task0371")
    expect(html).not.toContain("agent:private-task0371")
    expect(html).not.toContain("node:private-entry-task0371")
  })
})
