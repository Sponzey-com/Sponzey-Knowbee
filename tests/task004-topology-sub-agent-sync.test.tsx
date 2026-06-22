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
  it("projects setup sub-agents into a Knowbee-rooted topology without exposing internal ids", () => {
    const projection = buildSubAgentTopologyProjection({
      draft: draft(),
      now: 1_780_000_001_000,
    })

    expect(projection.topology.nodes.map((node) => node.id)).toEqual(["agent:knowbee", "agent:research"])
    expect(projection.topology.edges).toEqual([
      expect.objectContaining({
        sourceNodeId: "agent:knowbee",
        targetNodeId: "agent:research",
        type: "delegates_to",
      }),
    ])
    expect(projection.graph.executors.map((executor) => executor.name)).toEqual(["Knowbee", "Res"])
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

  it("renders root Knowbee as a main agent instead of a configurable sub-agent", () => {
    const projection = buildSubAgentTopologyProjection({
      draft: draft(),
      now: 1_780_000_001_000,
    })
    const executor = projection.graph.executors.find((item) => item.id === "agent:knowbee")!
    const summary = projection.summaries.get("agent:knowbee")!
    const html = renderToStaticMarkup(createElement(ExecutorInspector, {
      executor,
      graph: projection.graph,
      subAgentSummary: summary,
      readOnly: true,
    }))

    expect(html).toContain("메인 에이전트")
    expect(html).toContain("직접 하위")
    expect(html).toContain("Researcher")
    expect(html).toContain("disabled")
    expect(visibleText(html)).not.toMatch(/모델 자유 설정|agent:knowbee/)
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
      graphExecutorIds: ["agent:knowbee", "agent:research"],
      now: 1_780_000_004_000,
    }).get("agent:research")!

    expect(summary.readinessLabel).toBe("실행 가능")
    expect(summary.runtimeLabel).toBe("실행 중")
    expect(summary.savedLabel).toBe("저장됨")
    expect(summary.lastRuntimeLabel).toContain("1")
  })
})
