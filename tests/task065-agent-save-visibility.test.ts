import { describe, expect, it } from "vitest"
import type {
  AgentWorkspaceDetail,
  AgentWorkspacePageResponse,
} from "../packages/webui/src/contracts/agents.ts"
import { confirmCreatedAgentVisible } from "../packages/webui/src/lib/agent-save-visibility.ts"

const detail: AgentWorkspaceDetail = {
  agentRef: "agent_v1_776aad7125c5d34ba2a0b269",
  name: "향단이",
  role: "디자인 팀장",
  status: "enabled",
  profileVersion: 3,
  updatedAt: 1,
  model: { configured: false, availability: "unknown" },
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

describe("Task065 created agent visibility", () => {
  it("clears filters, closes the create drawer and keeps topology visible after authoritative verification", () => {
    expect(
      confirmCreatedAgentVisible({ agentRef: detail.agentRef, revision: 3, detail, page }),
    ).toEqual({
      ok: true,
      savedAgent: { agentRef: detail.agentRef, name: "향단이" },
      search: "",
      status: "",
      drawerMode: "detail",
    })
  })

  it.each([
    [{ revision: 4 }, "detail revision mismatch"],
    [{ page: { ...page, items: [] } }, "missing from authoritative list"],
    [
      { detail: { ...detail, agentRef: "agent_v1_aaaaaaaaaaaaaaaaaaaaaaaa" } },
      "detail owner mismatch",
    ],
  ])("rejects %s", (patch) => {
    expect(
      confirmCreatedAgentVisible({
        agentRef: detail.agentRef,
        revision: 3,
        detail,
        page,
        ...patch,
      }),
    ).toEqual({ ok: false, reasonCode: "agent_projection_not_verified" })
  })
})
