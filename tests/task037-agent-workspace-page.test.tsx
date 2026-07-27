import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type {
  AgentWorkspaceItem,
  AgentWorkspacePageResponse,
} from "../packages/webui/src/contracts/agents.js"
import { AgentsView } from "../packages/webui/src/pages/AgentsPage.js"

const item: AgentWorkspaceItem = {
  agentRef: `agent_v1_${"a".repeat(24)}`,
  name: "Researcher",
  role: "Evidence research",
  status: "enabled",
  profileVersion: 1,
  updatedAt: 1_000,
  model: { configured: true, availability: "ready", modelName: "worker" },
  parentName: "마당쇠",
  directChildCount: 0,
  bindingCounts: { skills: 1, mcpServers: 1, yeonjang: 1 },
  diagnosticCodes: [],
}
const detail = {
  ...item,
  bindingNames: { skills: ["UI UX Pro Max"], mcpServers: ["Penpot"], yeonjang: ["Studio Mac"] },
  directChildNames: ["Reviewer"],
}
const page: AgentWorkspacePageResponse = {
  items: [item],
  nextCursor: null,
  cursorValid: true,
  totalMatches: 1,
  observedAt: 1_000,
  summary: {
    total: 1,
    enabled: 1,
    disabled: 0,
    archived: 0,
    degraded: 0,
    issueCount: 0,
    diagnosticCodes: [],
  },
}
const callbacks = {
  onSearch: () => undefined,
  onStatus: () => undefined,
  onRefresh: () => undefined,
  onSelect: () => undefined,
  onClose: () => undefined,
}

describe("Task 037 agent workspace page", () => {
  it("renders one sub-agent in a small detail drawer without a main-agent node or internal ids", () => {
    const html = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page,
        selected: detail,
        loading: false,
        error: null,
        search: "",
        status: "",
      }),
    )
    expect(html).toContain('data-agent-ref="agent_v1_')
    expect(html).toContain('role="dialog"')
    expect(html).toContain("마당쇠")
    expect(html).toContain("UI UX Pro Max")
    expect(html).toContain("Reviewer")
    for (const label of ["기본", "AI", "기능", "메모리", "권한", "위임"])
      expect(html).toContain(label)
    expect(html).not.toContain("Knowbee 직속")
    expect(html).not.toMatch(
      /agentId|bindingId|catalogId|agent:main|agent:private|prompt|memory content/iu,
    )
  })

  it("keeps empty and error states explicit", () => {
    const emptyPage = {
      ...page,
      items: [],
      totalMatches: 0,
      summary: { ...page.summary, total: 0, enabled: 0 },
    }
    const empty = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page: emptyPage,
        selected: null,
        loading: false,
        error: null,
        search: "",
        status: "",
      }),
    )
    expect(empty).toContain("등록된 서브 에이전트가 없습니다")
    const error = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page: null,
        selected: null,
        loading: false,
        error: "agent_workspace_read_failed",
        search: "",
        status: "",
      }),
    )
    expect(error).toContain("에이전트 정보를 불러오지 못했습니다")
    expect(error).toContain("상태 새로고침")
    expect(error).not.toContain("agent_workspace_read_failed")
  })
})
