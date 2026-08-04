import { readFileSync } from "node:fs"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { afterEach, describe, expect, it } from "vitest"
import { createCapabilities } from "../packages/core/src/control-plane/index.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { FeatureGate } from "../packages/webui/src/components/FeatureGate.tsx"
import {
  EnterpriseTopologyCanvasShell,
  buildEnterpriseTopologyCanvasModel,
} from "../packages/webui/src/components/topology/EnterpriseTopologyCanvas.tsx"
import type { FeatureCapability } from "../packages/webui/src/contracts/capabilities.ts"
import {
  getUiNavigation,
  getUiRouteInventory,
  resolveLegacyAdvancedRoute,
  resolveModeSwitchRoute,
} from "../packages/webui/src/lib/ui-mode.js"
import { useCapabilitiesStore } from "../packages/webui/src/stores/capabilities"

function capability(status: FeatureCapability["status"]): FeatureCapability {
  return {
    key: "enterprise_topology_builder_ui",
    label: "Enterprise Topology Builder",
    area: "gateway",
    status,
    implemented: true,
    enabled: status === "ready",
    reason: "disabled by task016 test",
  }
}

afterEach(() => {
  useCapabilitiesStore.getState().setItems([])
})

describe("task016 enterprise topology UI shell", () => {
  it("unifies Runtime Resource Topology and Enterprise Builder behind the Topology workspace route", () => {
    const nav = getUiNavigation("advanced", false)
    const topologyNav = nav.find((item) => item.path === "/agents")
    const oldBuilderNav = nav.find((item) => item.path === "/advanced/enterprise-topology")
    const inventory = getUiRouteInventory()
    const workspaceRoute = inventory.find((item) => item.path === "/advanced/topology")
    const builderAlias = inventory.find((item) => item.path === "/advanced/enterprise-topology")

    expect(topologyNav).toEqual(expect.objectContaining({
      labelEn: "Sub-Agent Settings",
      capabilityKey: "enterprise_topology_builder_ui",
    }))
    expect(oldBuilderNav).toBeUndefined()
    expect(workspaceRoute).toEqual(expect.objectContaining({
      component: "UnifiedRouteRedirect",
      apiCalls: [],
      status: "redirect",
      replacementPath: "/agents",
    }))
    expect(builderAlias).toEqual(expect.objectContaining({
      component: "UnifiedRouteRedirect",
      status: "redirect",
      replacementPath: "/agents",
    }))
    expect(resolveLegacyAdvancedRoute("/enterprise-topology")).toBe("/agents")
    expect(resolveModeSwitchRoute("/advanced/enterprise-topology", "beginner")).toBe("/agents")
  })

  it("keeps the standalone capability gate while legacy routes redirect to the canonical workspace", () => {
    useCapabilitiesStore.getState().setItems([capability("disabled")])
    const apiCapability = createCapabilities({
      enterpriseTopologyBuilderEnabled: false,
      config: DEFAULT_CONFIG,
    })
      .find((item) => item.key === "enterprise_topology_builder_ui")

    const html = renderToStaticMarkup(
      createElement(
        FeatureGate,
        { capabilityKey: "enterprise_topology_builder_ui", title: "Enterprise Topology Builder" },
        createElement("div", null, "builder route content"),
      ),
    )
    const appSource = readFileSync(new URL("../packages/webui/src/App.tsx", import.meta.url), "utf-8")

    expect(apiCapability).toEqual(expect.objectContaining({
      status: "disabled",
      enabled: false,
    }))
    expect(appSource).toContain('path="/advanced/topology"')
    expect(appSource).toContain('<UnifiedRouteRedirect fallback="/agents" />')
    expect(html).toContain("Enterprise Topology Builder")
    expect(html).toContain("기능 상태를 확인할 수 없습니다")
    expect(html).not.toContain("builder route content")
  })

  it("renders the GUI-first builder shell without the old advanced palette surface", () => {
    const model = buildEnterpriseTopologyCanvasModel()
    const html = renderToStaticMarkup(
      createElement(EnterpriseTopologyCanvasShell, {
        model,
        selectedNodeId: model.nodes[0]?.id ?? null,
      }),
    )

    expect(model.palette.map((item) => item.id)).toEqual([
      "task",
      "decision",
      "approval",
      "tool",
      "data",
      "group",
      "org_unit",
      "position",
      "person",
      "process",
      "authority",
      "responsibility",
    ])
    expect(html).toContain('data-testid="topology-simple-create-panel"')
    expect(html).toContain('data-testid="enterprise-topology-canvas"')
    expect(html).not.toContain('data-testid="enterprise-topology-palette"')
    expect(html).toContain('data-testid="topology-workspace-inspector"')
    expect(html).toContain('data-testid="enterprise-topology-validation"')
    expect(html).not.toContain('data-testid="enterprise-topology-compile-preview"')
    expect(html).toContain('data-testid="topology-run-trace-overlay"')
    expect(html).toContain("Customer Intake")
    expect(html).toContain("CRM Search")
    expect(html).not.toContain('data-testid="topology-advanced-import-export"')
  })

  it("keeps the existing TopologyPage scoped to user-facing sub-agent composition copy", () => {
    const source = readFileSync(new URL("../packages/webui/src/pages/TopologyPage.tsx", import.meta.url), "utf-8")

    expect(source).toContain("api.agentTopology")
    expect(source).toContain("서브 에이전트 구성")
    expect(source).toContain("서브 에이전트와 팀의 위임 구조")
    expect(source).toContain("서브 에이전트 이름")
    expect(source).toContain("서브 에이전트 또는 팀을 선택하세요.")
    expect(source).toContain("구성 저장")
    expect(source).toContain("연결 정보")
    expect(source).toContain("메인 에이전트는 삭제할 수 없습니다.")
    expect(source).toContain("이 서브 에이전트를 아카이브할까요?")
    expect(source).toContain("팀 구성은 선택한 서브 에이전트 또는 팀 설정에서 관리합니다.")
    expect(source).not.toContain("Runtime Resource Topology")
    expect(source).not.toContain("Agent와 Team의 실행 리소스")
    expect(source).not.toContain('text("에이전트 이름"')
    expect(source).not.toContain('text("에이전트 추가"')
    expect(source).not.toContain("Layout 저장")
    expect(source).not.toContain("Connection Inspector")
    expect(source).not.toContain("Agent Inspector")
    expect(source).not.toContain("Team Inspector")
    expect(source).not.toContain("별칭")
    expect(source).not.toContain("Nickname")
    expect(source).not.toContain("대화 표시 이름")
    expect(source).not.toContain("Conversation name")
    expect(source).not.toContain("노드를 선택하세요.")
    expect(source).not.toContain("노드 이름이 필요합니다.")
    expect(source).not.toContain("메인 노비 노드")
    expect(source).not.toContain("팀 노드")
    expect(source).not.toContain("서브 에이전트 노드")
    expect(source).not.toContain("선택한 노드의 설정")
    expect(source).not.toContain("EnterpriseTopologyCanvas")
  })
})
