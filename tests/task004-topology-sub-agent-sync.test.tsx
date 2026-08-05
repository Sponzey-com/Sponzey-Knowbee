import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"

import { ExecutorCardNode } from "../packages/webui/src/components/topology/ExecutorCardNode.tsx"
import { ExecutorInspector } from "../packages/webui/src/components/topology/ExecutorInspector.tsx"
import type { SetupDraft } from "../packages/webui/src/contracts/setup.ts"
import {
  applyTopologyExecutorToSetupDraft,
  archiveTopologySubAgentInSetupDraft,
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
          agentName: "자료 담당",
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

function subAgentSummaryMarkup(markup: string): string {
  const marker = 'data-testid="topology-sub-agent-inspector-summary"'
  const markerIndex = markup.indexOf(marker)
  if (markerIndex < 0) return ""
  const sectionStart = markup.lastIndexOf("<section", markerIndex)
  const sectionEnd = markup.indexOf("</section>", markerIndex)
  if (sectionStart < 0 || sectionEnd < 0) return ""
  return markup.slice(sectionStart, sectionEnd + "</section>".length)
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1
}

describe("task004 topology sub-agent sync", () => {
  it("projects setup sub-agents with an implicit main agent instead of a visible root node", () => {
    const projection = buildSubAgentTopologyProjection({
      draft: draft(),
      now: 1_780_000_001_000,
    })

    expect(projection.topology.nodes.map((node) => node.id)).toEqual(["agent:research"])
    expect(projection.topology.edges).toEqual([])
    expect(projection.graph.executors.map((executor) => executor.name)).toEqual(["자료 담당"])
    expect(projection.graph.executors.some((executor) => executor.id === "agent:knowbee")).toBe(false)
    expect(projection.summaries.get("agent:knowbee")).toEqual(expect.objectContaining({
      role: "메인 에이전트",
      childCount: 1,
    }))
    expect(projection.summaries.get("agent:research")).toEqual(expect.objectContaining({
      agentName: "자료 담당",
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

    expect(nodeHtml).toContain("자료 담당")
    expect(nodeHtml).toContain("실행 반영 전")
    expect(nodeHtml).toContain("하위 서브 에이전트 0")
    expect(inspectorHtml).toContain("자료 담당")
    expect(inspectorHtml).toContain("자료를 찾고 근거를 정리합니다.")
    expect(inspectorHtml).toContain("Knowbee")
    expect(inspectorHtml).toContain("작업 능력/외부 기능")
    expect(inspectorHtml).toContain("공통 작업 능력/외부 기능 사용")
    const summaryText = visibleText(subAgentSummaryMarkup(inspectorHtml))
    expect(summaryText).toContain("자료 담당")
    expect(summaryText).toContain("상위 에이전트")
    expect(summaryText).toContain("하위 서브 에이전트")
    expect(summaryText).not.toContain("부모")
    expect(summaryText).not.toContain("직접 하위")
    expect(countOccurrences(summaryText, "자료 담당")).toBe(1)
    expect(visibleText(`${nodeHtml}\n${inspectorHtml}`)).not.toMatch(/Researcher|Res|agent:research|nickname_duplicate|reserved_knowbee_name/)
  })

  it("passes the current main agent name into the setup inspector copy", () => {
    const projection = buildSubAgentTopologyProjection({
      draft: draft(),
      now: 1_780_000_001_000,
    })
    const executor = projection.graph.executors.find((item) => item.id === "agent:research")!
    const summary = projection.summaries.get("agent:research")!

    const inspectorHtml = renderToStaticMarkup(createElement(ExecutorInspector, {
      executor,
      graph: projection.graph,
      rootAgentLabel: "마당쇠",
      subAgentSummary: summary,
    }))

    expect(inspectorHtml).toContain("마당쇠 직속")
    expect(inspectorHtml).toContain("서브 에이전트 정의 요약")
    expect(inspectorHtml).not.toContain("노비가 이해한 내용")
    expect(inspectorHtml).not.toContain("Knowbee understood")
  })

  it("uses neutral main agent wording in setup inspector when the label is still the default alias", () => {
    const projection = buildSubAgentTopologyProjection({
      draft: draft(),
      now: 1_780_000_001_000,
    })
    const executor = projection.graph.executors.find((item) => item.id === "agent:research")!
    const summary = projection.summaries.get("agent:research")!

    const inspectorHtml = renderToStaticMarkup(createElement(ExecutorInspector, {
      executor,
      graph: projection.graph,
      rootAgentLabel: "노비",
      subAgentSummary: summary,
    }))

    expect(inspectorHtml).toContain("메인 에이전트 직속")
    expect(inspectorHtml).toContain("메인 에이전트 기준")
    expect(inspectorHtml).not.toContain("노비 직속")
    expect(inspectorHtml).not.toContain("노비 기준")
  })

  it("keeps technical direct-child wording out of visible sub-agent setup copy", () => {
    const source = [
      readFileSync("packages/webui/src/lib/topology-sub-agent-sync.ts", "utf8"),
      readFileSync("packages/webui/src/components/topology/ExecutorInspector.tsx", "utf8"),
    ].join("\n")

    expect(source).toContain("직속 서브 에이전트")
    expect(source).not.toContain("직접 하위")
    expect(source).not.toContain("direct child sub-agents")
  })

  it("uses an explicit unnamed fallback instead of legacy names when agentName is missing", () => {
    const legacy = draft()
    if (!legacy.subAgents?.items[0]) throw new Error("fixture missing")
    const { agentName: _agentName, ...legacyWithoutAgentName } = legacy.subAgents.items[0]
    legacy.subAgents.items[0] = {
      ...legacyWithoutAgentName,
      displayName: "Legacy Display",
      nickname: "Legacy Nick",
    }
    const projection = buildSubAgentTopologyProjection({
      draft: legacy,
      now: 1_780_000_001_000,
    })
    const executor = projection.graph.executors.find((item) => item.id === "agent:research")!
    const summary = projection.summaries.get("agent:research")!

    expect(executor.name).toBe("Unnamed sub-agent")
    expect(summary.agentName).toBe("Unnamed sub-agent")
    expect(summary.parentDisplayName).toBe("Knowbee")
    expect(JSON.stringify({ executor, summary })).not.toMatch(/Legacy Display|Legacy Nick/)
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
      agentName: "Analyst",
      role: "검증 담당",
      description: "자료를 검증하고 정리합니다.",
      updatedAt: 1_780_000_002_000,
    }))
    expect(next.subAgents?.items[0]).not.toHaveProperty("displayName")
    expect(next.subAgents?.items[0]).not.toHaveProperty("nickname")
  })

  it("preserves empty name, role, and description while editing the setup draft", () => {
    const projection = buildSubAgentTopologyProjection({ draft: draft(), now: 1_780_000_001_000 })
    const executor = projection.graph.executors.find((item) => item.id === "agent:research")!
    const next = applyTopologyExecutorToSetupDraft(draft(), {
      ...executor,
      name: "",
      description: "",
      executorProfile: {
        ...executor.executorProfile!,
        roleName: "",
      },
    }, 1_780_000_002_000)

    expect(next.subAgents?.items[0]).toMatchObject({
      agentName: "",
      role: "",
      description: "",
    })
    const projected = buildSubAgentTopologyProjection({ draft: next })
    expect(projected.graph.executors[0]).toMatchObject({
      name: "",
      description: "",
      executorProfile: expect.objectContaining({ roleName: "" }),
    })
  })

  it("archives the selected sub-agent and reparents its direct children", () => {
    const base = draft()
    const withChild: SetupDraft = {
      ...base,
      subAgents: {
        ...base.subAgents!,
        runtimeActiveAgentIds: ["agent:research", "agent:child"],
        items: [
          ...base.subAgents!.items,
          {
            agentId: "agent:child",
            parentAgentId: "agent:research",
            agentName: "하위 담당",
            role: "하위 역할",
            description: "하위 작업",
            status: "enabled",
            createdAt: 1_780_000_000_000,
            updatedAt: 1_780_000_000_000,
            profileVersion: 1,
          },
        ],
      },
    }

    const next = archiveTopologySubAgentInSetupDraft(
      withChild,
      "agent:research",
      1_780_000_003_000,
    )

    expect(next.subAgents?.items.find((item) => item.agentId === "agent:research")).toMatchObject({
      status: "archived",
      updatedAt: 1_780_000_003_000,
      profileVersion: 2,
    })
    expect(next.subAgents?.items.find((item) => item.agentId === "agent:child")?.parentAgentId)
      .toBe("agent:knowbee")
    expect(next.subAgents?.runtimeActiveAgentIds).toEqual(["agent:child"])
    expect(buildSubAgentTopologyProjection({ draft: next }).graph.executors.map((item) => item.id))
      .toEqual(["agent:child"])
  })

  it("wires setup sub-agent deletion to archive and immediate draft persistence", () => {
    const source = readFileSync("packages/webui/src/pages/TopologyWorkspacePage.tsx", "utf8")

    expect(source).toContain("const selectedSetupSubAgent = setupDraft.subAgents?.items.some")
    expect(source).toContain("archiveTopologySubAgentInSetupDraft(setupDraft, selectedExecutorId)")
    expect(source).toContain("void saveSetupDraftSnapshot(nextDraft).then")
    expect(source).not.toContain("subAgentProjection?.summaries.has(selectedExecutorId)")
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
