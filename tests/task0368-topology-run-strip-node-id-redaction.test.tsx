import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { WORK_ORDER_TEMPLATE_CATALOG } from "../packages/core/src/topology-runtime/work-order-templates.ts"
import type { EnterpriseTopologyRunRecord } from "../packages/webui/src/lib/enterprise-topology-operations.ts"
import {
  TopologyRunStrip,
  resolveTopologyRunTargetState,
} from "../packages/webui/src/components/topology/TopologyRunStrip.tsx"
import {
  buildTopologyWorkspaceStarterDraft,
} from "../packages/webui/src/lib/topology-workspace-templates.ts"

const now = Date.UTC(2026, 6, 6, 12, 0, 0)
const template = WORK_ORDER_TEMPLATE_CATALOG.templates[0]!

describe("task0368 topology run strip node id redaction", () => {
  it("renders sub-agent display names instead of internal node ids", () => {
    const baseTopology = buildTopologyWorkspaceStarterDraft("tool-assisted-flow", { now })
    const targetNodeId = baseTopology.nodes[0]!.id
    const topology = {
      ...baseTopology,
      nodes: baseTopology.nodes.map((node) =>
        node.id === targetNodeId
          ? { ...node, displayName: "자료 조사 담당" }
          : node,
      ),
    }
    const targetState = resolveTopologyRunTargetState({ topology })
    const latestRun: EnterpriseTopologyRunRecord = {
      topologyRunId: "topology-run:task0368",
      topologyId: topology.id,
      status: "completed",
      entryNodeId: targetNodeId,
      startedAt: now,
      finishedAt: now + 1000,
      createdAt: now,
      updatedAt: now + 1000,
      metadata: {
        templateId: template.templateId,
        contextPresetId: template.contextPresets[0]!.id,
      },
    }

    const html = renderToStaticMarkup(
      createElement(TopologyRunStrip, {
        topology,
        templates: WORK_ORDER_TEMPLATE_CATALOG.templates,
        selectedTemplateId: template.templateId,
        selectedContextPresetId: template.contextPresets[0]!.id,
        simulationMode: "success",
        advancedInstruction: "",
        runTargetNodeId: targetState.targetNodeId,
        targetState,
        recentRuns: [latestRun],
        selectedRunId: latestRun.topologyRunId,
      }),
    )

    expect(html).toContain("자료 조사 담당")
    expect(html).not.toContain(targetNodeId)
    expect(html).not.toContain("node:")
  })
})
