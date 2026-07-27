import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import type {
  AgentRelationshipProjection,
  AgentWorkspaceDetail,
  AgentWorkspacePageResponse,
} from "../packages/webui/src/contracts/agents.js"
import { AgentsView } from "../packages/webui/src/pages/AgentsPage.js"

const rootRef = `agent_v1_${"0".repeat(24)}`
const selectedRef = `agent_v1_${"1".repeat(24)}`
const childRef = `agent_v1_${"2".repeat(24)}`
const peerRef = `agent_v1_${"3".repeat(24)}`

function detail(agentRef: string, name: string): AgentWorkspaceDetail {
  return {
    agentRef,
    name,
    role: `${name} role`,
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
}

const selected = detail(selectedRef, "Research")
const page: AgentWorkspacePageResponse = {
  items: [selected, detail(childRef, "Writer"), detail(peerRef, "Review")],
  nextCursor: null,
  cursorValid: true,
  totalMatches: 3,
  summary: {
    total: 3,
    enabled: 3,
    disabled: 0,
    archived: 0,
    degraded: 0,
    issueCount: 0,
    diagnosticCodes: [],
  },
  observedAt: 1,
}
const projection: AgentRelationshipProjection = {
  root: { agentRef: rootRef, name: "마당쇠" },
  relationships: [
    {
      relationshipRef: `relationship_v1_${"a".repeat(24)}`,
      parentRef: rootRef,
      parentName: "마당쇠",
      childRef: selectedRef,
      childName: "Research",
      depth: 1,
      sortOrder: 0,
    },
    {
      relationshipRef: `relationship_v1_${"b".repeat(24)}`,
      parentRef: selectedRef,
      parentName: "Research",
      childRef,
      childName: "Writer",
      depth: 2,
      sortOrder: 0,
    },
  ],
  revision: 2,
  observedAt: 1,
}
const callbacks = {
  onSearch: () => undefined,
  onStatus: () => undefined,
  onRefresh: () => undefined,
  onSelect: () => undefined,
  onClose: () => undefined,
}

describe("Task 041 agent delegation drawer", () => {
  it("shows the named main agent and excludes self and descendants from parent options", () => {
    const html = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page,
        selected,
        loading: false,
        error: null,
        search: "",
        status: "",
        activeSection: "delegation",
        relationshipProjection: projection,
        relationshipParentDraft: rootRef,
      }),
    )
    const select = html.match(/<select aria-label="상위 에이전트"[\s\S]*?<\/select>/u)?.[0] ?? ""
    expect(select).toContain("마당쇠 직속")
    expect(select).toContain("Review")
    expect(select).not.toContain("Research")
    expect(select).not.toContain("Writer")
    expect(html).toContain("위임 저장")
  })

  it("preserves a public failure reason and locks close and parent controls while saving", () => {
    const html = renderToStaticMarkup(
      createElement(AgentsView, {
        ...callbacks,
        page,
        selected,
        loading: false,
        error: null,
        search: "",
        status: "",
        activeSection: "delegation",
        relationshipProjection: projection,
        relationshipParentDraft: peerRef,
        relationshipError: "mutation_revision_conflict",
        saving: true,
      }),
    )
    expect(html).toContain("mutation_revision_conflict")
    expect(html).toMatch(/aria-label="상위 에이전트"[^>]*disabled/u)
    expect(html).toMatch(/aria-label="Close Research"[^>]*disabled/u)
    expect(html).toMatch(/aria-busy="true"/u)
  })
})
