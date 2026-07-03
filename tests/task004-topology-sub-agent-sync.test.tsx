import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"

import { ExecutorCardNode } from "../packages/webui/src/components/topology/ExecutorCardNode.tsx"
import { ExecutorInspector } from "../packages/webui/src/components/topology/ExecutorInspector.tsx"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import {
  applyTopologyExecutorToSetupDraft,
  buildSubAgentTopologyProjection,
  buildTopologySubAgentSummaryMap,
} from "../packages/webui/src/lib/topology-sub-agent-sync.ts"
import { buildExecutorGraphRelationInfoMap } from "../packages/webui/src/lib/executor-graph-relations.ts"

function draft(): SetupDraft {
  return {
    personal: {
      profileName: "dongwoo",
      displayName: "Dongwoo",
      language: "ko",
      timezone: "Asia/Seoul",
      workspace: "/tmp",
    },
    aiBackends: [],
    routingProfiles: [],
    mcp: { servers: [] },
    skills: { items: [] },
    security: {
      approvalMode: "on-miss",
      approvalTimeout: 60,
      approvalTimeoutFallback: "deny",
      maxDelegationTurns: 5,
    },
    channels: {} as SetupDraft["channels"],
    mqtt: { enabled: false, host: "0.0.0.0", port: 1883, username: "", password: "" },
    remoteAccess: { authEnabled: false, authToken: "", host: "127.0.0.1", port: 18888 },
    subAgents: {
      orchestrationEnabled: true,
      items: [
        {
          agentId: "agent:research",
          displayName: "Researcher",
          nickname: "Res",
          role: "자료를 찾고 근거를 정리합니다.",
          description: "검색과 요약을 맡습니다.",
          status: "enabled",
          createdAt: 1_780_000_000_000,
          updatedAt: 1_780_000_000_000,
          profileVersion: 1,
        },
      ],
      runtimeActiveAgentIds: [],
      lastRuntimeSeenAtByAgentId: {},
    },
  }
}

function visibleText(markup: string): string {
  return markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

describe("task004 topology sub-agent sync", () => {
  it("projects setup sub-agents with an implicit main agent instead of a visible root node", () => {
    const projection = buildSubAgentTopologyProjection({
      draft: draft(),
      now: 1_780_000_001_000,
    })

    expect(projection.topology.nodes.map((node) => node.id)).toEqual(["agent:research"])
    expect(projection.topology.edges).toEqual([])
    expect(projection.graph.executors.map((executor) => executor.name)).toEqual(["Res"])
    expect(projection.graph.executors.some((executor) => executor.id === "agent:knowbee")).toBe(false)
    expect(projection.summaries.get("agent:knowbee")).toEqual(expect.objectContaining({
      role: "메인 에이전트",
      childCount: 1,
    }))
    expect(projection.summaries.get("agent:research")).toEqual(expect.objectContaining({
      displayName: "Researcher",
      nickname: "Res",
      parentDisplayName: "Knowbee",
      childCount: 0,
      readinessLabel: "실행 반영 전",
      runtimeLabel: "실행 반영 전",
    }))
    expect(JSON.stringify(projection.summaries.get("agent:research"))).not.toMatch(/agent:/)
  })

  it("renders sub-agent node and inspector summary from the same setup source", () => {
    const projection = buildSubAgentTopologyProjection({
      draft: draft(),
      now: 1_780_000_001_000,
    })
    const executor = projection.graph.executors.find((item) => item.id === "agent:research")!
    const summary = projection.summaries.get("agent:research")!

    const nodeHtml = renderToStaticMarkup(createElement(ExecutorCardNode, {
      executor,
      subAgentSummary: summary,
    }))
    const inspectorHtml = renderToStaticMarkup(createElement(ExecutorInspector, {
      executor,
      graph: projection.graph,
      subAgentSummary: summary,
    }))

    expect(nodeHtml).toContain("Res")
    expect(nodeHtml).toContain("실행 반영 전")
    expect(nodeHtml).toContain("하위 0")
    expect(inspectorHtml).toContain("Researcher")
    expect(inspectorHtml).toContain("자료를 찾고 근거를 정리합니다.")
    expect(inspectorHtml).toContain("Knowbee")
    expect(inspectorHtml).toContain("Skill/MCP")
    expect(visibleText(`${nodeHtml}\n${inspectorHtml}`)).not.toMatch(/agent:research|nickname_duplicate|reserved_knowbee_name/)
  })

  it("does not render the implicit main agent as a canvas card", () => {
    const projection = buildSubAgentTopologyProjection({
      draft: draft(),
      now: 1_780_000_001_000,
    })
    const relationInfo = buildExecutorGraphRelationInfoMap(projection.graph, { rootAgentLabel: "마당쇠" })

    expect(projection.graph.executors.map((executor) => executor.id)).toEqual(["agent:research"])
    expect(projection.graph.connections).toEqual([])
    expect(relationInfo.get("agent:research")).toEqual(expect.objectContaining({
      relationKind: "root_direct",
      relationLabelKo: "마당쇠 직속",
    }))
    expect(JSON.stringify(projection.graph)).not.toContain("agent:knowbee")
  })

  it("round-trips topology executor edits back into setup sub-agent draft", () => {
    const projection = buildSubAgentTopologyProjection({
      draft: draft(),
      now: 1_780_000_001_000,
    })
    const executor = projection.graph.executors.find((item) => item.id === "agent:research")!
    const next = applyTopologyExecutorToSetupDraft(draft(), {
      ...executor,
      name: "Analyst",
      description: "자료를 검증하고 정리합니다.",
      executorProfile: {
        ...executor.executorProfile!,
        roleName: "검증 담당",
      },
    }, 1_780_000_002_000)

    expect(next.subAgents?.items[0]).toEqual(expect.objectContaining({
      displayName: "Analyst",
      nickname: "Analyst",
      role: "검증 담당",
      description: "자료를 검증하고 정리합니다.",
      updatedAt: 1_780_000_002_000,
    }))
  })

  it("builds saved/runtime status summaries for draft, saved, and active differences", () => {
    const base = draft()
    const summary = buildTopologySubAgentSummaryMap({
      draft: {
        ...base,
        subAgents: {
          ...base.subAgents!,
          runtimeActiveAgentIds: ["agent:research"],
          lastRuntimeSeenAtByAgentId: { "agent:research": 1_780_000_003_000 },
        },
      },
      graphExecutorIds: ["agent:research"],
      now: 1_780_000_004_000,
    }).get("agent:research")!

    expect(summary.readinessLabel).toBe("실행 가능")
    expect(summary.runtimeLabel).toBe("실행 중")
    expect(summary.savedLabel).toBe("저장됨")
    expect(summary.lastRuntimeLabel).toContain("1")
  })
})
