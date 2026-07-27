import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type {
  AgentWorkspaceDetail,
  AgentWorkspacePageResponse,
} from "../packages/webui/src/contracts/agents.js"
import { AgentsView } from "../packages/webui/src/pages/AgentsPage.js"

const detail: AgentWorkspaceDetail = {
  agentRef: `agent_v1_${"a".repeat(24)}`,
  name: "A",
  role: "Research",
  status: "enabled",
  profileVersion: 3,
  updatedAt: 1,
  model: { configured: false, availability: "unavailable" },
  parentName: "마당쇠",
  directChildCount: 2,
  bindingCounts: { skills: 1, mcpServers: 1, yeonjang: 1 },
  diagnosticCodes: [],
  bindingNames: { skills: ["UI UX Pro Max"], mcpServers: ["Penpot"], yeonjang: ["Studio Mac"] },
  directChildNames: ["Reviewer", "Writer"],
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
const callbacks = {
  onSearch: () => undefined,
  onStatus: () => undefined,
  onRefresh: () => undefined,
  onSelect: () => undefined,
  onClose: () => undefined,
}

describe("Task 038 agent identity drawer", () => {
  it("keeps an explicitly empty draft empty instead of restoring the last character", () => {
    const html = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page,
        selected: detail,
        loading: false,
        error: null,
        search: "",
        status: "",
        drawerMode: "detail",
        draftName: "",
        draftRole: "",
        saving: false,
      }),
    )
    expect(html).toMatch(/aria-label="에이전트 이름"[^>]*value=""/)
    expect(html).toMatch(/aria-label="에이전트 역할"[^>]*rows="3"[^>]*><\/textarea>/)
  })

  it("renders a compact create form and disables controls while saving", () => {
    const html = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page,
        selected: null,
        loading: false,
        error: null,
        search: "",
        status: "",
        drawerMode: "create",
        draftName: "Writer",
        draftRole: "Drafts",
        saving: true,
      }),
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain("에이전트 추가")
    expect(html).toMatch(/aria-label="에이전트 이름"[^>]*disabled/)
    expect(html).toMatch(/aria-busy="true"/)
  })

  it("shows archive impact and requires explicit confirmation", () => {
    const html = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page,
        selected: detail,
        loading: false,
        error: null,
        search: "",
        status: "",
        drawerMode: "detail",
        draftName: detail.name,
        draftRole: detail.role,
        archiveConfirmed: false,
        saving: false,
      }),
    )
    expect(html).toContain("하위 2개와 연결 3개의 영향을 확인했습니다.")
    expect(html).toMatch(/에이전트 보관<\/button>/)
    expect(html).toMatch(/disabled=""[^>]*>에이전트 보관/)
  })
})
