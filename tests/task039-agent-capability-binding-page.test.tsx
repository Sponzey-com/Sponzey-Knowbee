import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type {
  AgentCapabilityBindingProjection,
  AgentWorkspaceDetail,
  AgentWorkspacePageResponse,
} from "../packages/webui/src/contracts/agents.js"
import { AgentsView } from "../packages/webui/src/pages/AgentsPage.js"

const agentRef = `agent_v1_${"a".repeat(24)}`
const detail: AgentWorkspaceDetail = {
  agentRef,
  name: "Designer",
  role: "Product design",
  status: "enabled",
  profileVersion: 1,
  updatedAt: 1,
  model: { configured: true, availability: "ready" },
  parentName: "마당쇠",
  directChildCount: 0,
  bindingCounts: { skills: 0, mcpServers: 0, yeonjang: 0 },
  diagnosticCodes: [],
  bindingNames: { skills: [], mcpServers: [], yeonjang: [] },
  directChildNames: [],
}
const page: AgentWorkspacePageResponse = {
  items: [detail],
  nextCursor: null,
  cursorValid: true,
  totalMatches: 1,
  summary: {
    total: 1,
    enabled: 1,
    disabled: 0,
    archived: 0,
    degraded: 0,
    issueCount: 0,
    diagnosticCodes: [],
  },
  observedAt: 1,
}
const capabilityProjection: AgentCapabilityBindingProjection = {
  agentRef,
  items: [
    {
      capabilityRef: `skill_v1_${"b".repeat(24)}`,
      kind: "skill",
      displayName: "UI UX Pro Max",
      catalogStatus: "enabled",
      runtimeStatus: "ready",
      bound: false,
      editable: true,
      revision: 3,
      reasonCodes: [],
    },
    {
      capabilityRef: `mcp_v1_${"c".repeat(24)}`,
      kind: "mcp_server",
      displayName: "Penpot",
      catalogStatus: "enabled",
      runtimeStatus: "unknown",
      bound: true,
      editable: true,
      revision: 4,
      reasonCodes: [],
    },
    {
      capabilityRef: `yeonjang_v1_${"d".repeat(24)}`,
      kind: "yeonjang",
      displayName: "Studio Mac",
      catalogStatus: "disabled",
      runtimeStatus: "unavailable",
      bound: false,
      editable: true,
      revision: 5,
      reasonCodes: ["capability_runtime_unavailable"],
    },
  ],
  orphanReasonCodes: [],
  revisions: { skill: 3, mcp_server: 4, yeonjang: 5 },
  observedAt: 1,
}
const callbacks = {
  onSearch: () => undefined,
  onStatus: () => undefined,
  onRefresh: () => undefined,
  onSelect: () => undefined,
  onClose: () => undefined,
}

describe("Task 039 agent capability binding drawer", () => {
  it("renders Basic and Capabilities as actual tab buttons", () => {
    const html = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page,
        selected: detail,
        loading: false,
        error: null,
        search: "",
        status: "",
        activeSection: "basic",
      }),
    )
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>기본<\/button>/)
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>기능<\/button>/)
    expect(html).not.toContain("기능 저장")
  })

  it("shows one searchable list for Skill, MCP and Yeonjang with changed draft summary", () => {
    const html = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page,
        selected: detail,
        loading: false,
        error: null,
        search: "",
        status: "",
        activeSection: "capabilities",
        capabilityProjection,
        capabilityDraft: {
          [capabilityProjection.items[0]?.capabilityRef ?? ""]: true,
          [capabilityProjection.items[1]?.capabilityRef ?? ""]: true,
        },
      }),
    )
    expect(html).toContain('aria-label="기능 검색"')
    expect(html).toContain('aria-label="기능 종류"')
    expect(html).toContain("UI UX Pro Max")
    expect(html).toContain("Penpot")
    expect(html).toContain("Studio Mac")
    expect(html).toContain("변경 1")
    expect(html).toContain("기능 저장")
    expect(html).not.toContain('aria-label="에이전트 이름"')
  })

  it("locks all capability controls during save", () => {
    const html = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page,
        selected: detail,
        loading: false,
        error: null,
        search: "",
        status: "",
        activeSection: "capabilities",
        capabilityProjection,
        capabilityDraft: { [capabilityProjection.items[0]?.capabilityRef ?? ""]: true },
        saving: true,
      }),
    )
    expect(html).toMatch(/aria-label="기능 검색"[^>]*disabled/)
    expect(html).toMatch(/aria-label="UI UX Pro Max 연결"[^>]*disabled/)
    expect(html).toMatch(/aria-label="Close Designer"[^>]*disabled/)
    expect(html).toMatch(/aria-busy="true"/)
  })
})
