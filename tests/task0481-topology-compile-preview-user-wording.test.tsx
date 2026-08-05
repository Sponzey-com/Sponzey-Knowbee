import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import { TopologyCompilePreview } from "../packages/webui/src/components/topology/TopologyCompilePreview.tsx"
import type { EnterpriseTopologyGuiDraftCompiledPreviewResponse } from "../packages/webui/src/lib/enterprise-topology-operations.ts"

function visibleText(markup: string): string {
  return markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function compiledPreview(): EnterpriseTopologyGuiDraftCompiledPreviewResponse {
  return {
    ok: true,
    topologyId: "topology:task0481",
    draftId: "draft:task0481",
    compiledTopologySnapshotId: "compiled:task0481",
    validation: {
      ok: true,
      issues: [],
      summary: { errors: 0, warnings: 0, infos: 0 },
    },
    delegationTree: {
      rootNodeIds: ["agent:intake"],
      entryNodeId: "agent:intake",
      exitNodeIds: ["agent:review"],
      edges: { "agent:intake": ["agent:review"] },
      parents: { "agent:review": ["agent:intake"] },
    },
    runtimeExecutionContext: {
      topologyId: "topology:task0481",
      entryNodeId: "agent:intake",
      exitNodeIds: ["agent:review"],
      nodeCount: 2,
      delegationEdgeCount: 1,
    },
    runtimeProfiles: [
      {
        nodeId: "agent:intake",
        name: "접수 담당",
        nodeType: "work_node",
        childNodeIds: ["agent:review"],
        parentNodeIds: [],
        allowedToolIds: ["tool:search"],
        allowedSystemIds: [],
        failureReportRequired: true,
      },
    ],
    workOrderPreview: {
      workOrderId: "work-order:task0481",
      topologyRunId: "run:task0481",
      parentWorkOrderId: null,
      fromNodeId: "agent:intake",
      to: { type: "node", id: "agent:intake" },
      objective: "요청을 접수하고 검토로 넘긴다.",
      scope: { included: [], excluded: [] },
      successCriteria: [
        {
          criterionId: "criterion:task0481",
          description: "요청 요약이 있다.",
          required: true,
          validationKind: "manual",
        },
      ],
      permissionScope: {
        allowedToolIds: ["tool:search"],
        allowedSystemIds: [],
        dataDomainIds: [],
      },
      authorityScope: {
        requiredAuthorityRuleIds: [],
        approvalRequired: false,
      },
      failureReportRequired: true,
      delegationPath: ["agent:intake"],
      createdAt: "2026-07-06T00:00:00.000Z",
    },
  }
}

describe("task0481 topology compile preview user wording", () => {
  it("renders compile preview with sub-agent wording instead of internal compile/work-order labels", () => {
    const html = renderToStaticMarkup(createElement(TopologyCompilePreview, { preview: compiledPreview() }))
    const text = visibleText(html)

    expect(text).toContain("실행 구조 미리보기")
    expect(text).toContain("실행 가능")
    expect(text).toContain("서브 에이전트 전달 구조")
    expect(text).toContain("업무 서브 에이전트")
    expect(text).toContain("하위 서브 에이전트 1")
    expect(text).toContain("작업 지시 미리보기")
    expect(text).not.toContain("Compile Preview")
    expect(text).not.toContain("Compiled Delegation Tree")
    expect(text).not.toContain("Compilable")
    expect(text).not.toContain("WorkOrder Preview")
    expect(text).not.toContain("이름 없는 항목")
    expect(text).not.toContain("알 수 없는 항목")
  })
})
