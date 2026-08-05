import type { AgentWorkspaceDetail, AgentWorkspacePageResponse } from "../contracts/agents"

export type CreatedAgentVisibilityResult =
  | {
      ok: true
      savedAgent: { agentRef: string; name: string }
      search: ""
      status: ""
      drawerMode: "detail"
    }
  | { ok: false; reasonCode: "agent_projection_not_verified" }

export function confirmCreatedAgentVisible(input: {
  agentRef: string
  revision: number | undefined
  detail: AgentWorkspaceDetail
  page: AgentWorkspacePageResponse
}): CreatedAgentVisibilityResult {
  const listed = input.page.items.find((item) => item.agentRef === input.agentRef)
  if (
    !input.revision ||
    input.detail.agentRef !== input.agentRef ||
    input.detail.profileVersion !== input.revision ||
    !listed ||
    listed.profileVersion !== input.revision
  ) {
    return { ok: false, reasonCode: "agent_projection_not_verified" }
  }
  return {
    ok: true,
    savedAgent: { agentRef: input.agentRef, name: input.detail.name },
    search: "",
    status: "",
    drawerMode: "detail",
  }
}
