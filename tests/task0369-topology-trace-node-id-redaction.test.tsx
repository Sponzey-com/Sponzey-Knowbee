import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import type { TopologyRunTraceOverlayInput } from "../packages/webui/src/components/topology/TopologyRunTraceOverlay.tsx"
import { TopologyRunTraceOverlay } from "../packages/webui/src/components/topology/TopologyRunTraceOverlay.tsx"
import { buildTopologyWorkspaceStarterDraft } from "../packages/webui/src/lib/topology-workspace-templates.ts"

const now = Date.UTC(2026, 6, 6, 13, 0, 0)

describe("task0369 topology trace node id redaction", () => {
  it("renders trace node labels without visible internal node ids", () => {
    const baseTopology = buildTopologyWorkspaceStarterDraft("customer-request-flow", { now })
    const firstNodeId = baseTopology.nodes[0]!.id
    const secondNodeId = baseTopology.nodes[1]!.id
    const topology = {
      ...baseTopology,
      nodes: baseTopology.nodes.map((node, index) => ({
        ...node,
        displayName: index === 0 ? "요청 접수 담당" : index === 1 ? "검토 담당" : node.displayName,
      })),
    }
    const overlay: TopologyRunTraceOverlayInput = {
      run: {
        topologyRunId: "topology-run:task0369",
        topologyId: topology.id,
        status: "failed",
        entryNodeId: firstNodeId,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
        metadata: {},
      },
      traceEvents: [{
        traceEventId: "trace:task0369",
        topologyRunId: "topology-run:task0369",
        nodeRunId: "node-run:task0369",
        workOrderId: "work-order:task0369",
        nodeId: secondNodeId,
        phase: "execution",
        reasonCode: "failed_candidate",
        delegationPath: [firstNodeId, secondNodeId],
        createdAt: now,
        metadata: {},
      }],
      toolCalls: [],
      failureReports: [{
        failureReportId: "failure:task0369",
        topologyRunId: "topology-run:task0369",
        nodeRunId: "node-run:task0369",
        workOrderId: "work-order:task0369",
        nodeId: secondNodeId,
        failurePhase: "execution",
        report: {
          schemaVersion: 1,
          issueKind: "success_criteria_unmet",
          reason: "검토 기준을 만족하지 못했습니다.",
          triedRecoveryActions: [],
          untriedOptions: ["다른 검토자에게 위임"],
          recommendedAction: "redelegate",
          escalationRequired: false,
          exhaustionSummary: {
            attemptedActions: [],
            remainingOptions: ["다른 검토자에게 위임"],
            stopReason: "retry_limit",
          },
        },
        createdAt: now,
      }],
    }

    const html = renderToStaticMarkup(createElement(TopologyRunTraceOverlay, { overlay, topology }))

    expect(html).toContain("요청 접수 담당")
    expect(html).toContain("검토 담당")
    expect(html).not.toContain(firstNodeId)
    expect(html).not.toContain(secondNodeId)
    expect(html).not.toContain("node:")
  })
})
