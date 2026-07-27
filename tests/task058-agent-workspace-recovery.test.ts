import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { createElement } from "../packages/webui/node_modules/react/index.js"
import {
  initialAgentBindingMutation,
  projectAgentReceiptFailure,
  reduceAgentBindingMutation,
} from "../packages/webui/src/lib/agent-workspace-recovery.ts"
import { AgentsView } from "../packages/webui/src/pages/AgentsPage.tsx"

describe("Task058 agent workspace recovery", () => {
  it("forbids raw failure strings in the canonical agent page", () => {
    const page = readFileSync(
      new URL("../packages/webui/src/pages/AgentsPage.tsx", import.meta.url),
      "utf8",
    )
    expect(page).not.toContain("reason instanceof Error ? reason.message")
    expect(page).not.toContain('failures.join(" / ")')
    expect(page).toContain("UserRecoveryNotice")
    expect(page).toContain("mutationNoticeRef.current?.focus()")
    expect(page).toContain("ResourceReadState<AgentCapabilityBindingProjection>")
    expect(page).toContain("ResourceReadState<AgentRelationshipProjection>")
    expect(
      page.match(/if \(controller\.signal\.aborted\) return/gu)?.length,
    ).toBeGreaterThanOrEqual(2)
  })

  it("renders bounded agent recovery copy without its private reason", () => {
    const html = renderToStaticMarkup(
      createElement(AgentsView, {
        page: null,
        selected: null,
        loading: false,
        search: "",
        status: "",
        drawerMode: "create",
        mutationError: {
          kind: "unavailable",
          reasonCode: "private_agent_adapter_503",
          messageKey: "unavailable",
          action: "refresh_state",
          actionLabelKey: "refresh_state",
        },
        onSearch: () => undefined,
        onStatus: () => undefined,
        onRefresh: () => undefined,
        onSelect: () => undefined,
        onClose: () => undefined,
      }),
    )
    expect(html).toContain("에이전트 정보를 불러오지 못했습니다")
    expect(html).toContain("상태 새로고침")
    expect(html).not.toContain("private_agent_adapter_503")
  })

  it("projects stable receipt reasons without echoing the reason code", () => {
    expect(projectAgentReceiptFailure("mutation_revision_conflict")).toMatchObject({
      kind: "conflict",
      action: "refresh_state",
    })
    expect(projectAgentReceiptFailure("permission_denied")).toMatchObject({
      kind: "authorization",
      action: "contact_admin",
    })
    expect(projectAgentReceiptFailure("private_agent_adapter_failure")).toMatchObject({
      kind: "unknown",
      reasonCode: "request_failed",
    })
  })

  it("keeps partial outcomes structured and blocks save until unverified state is refreshed", () => {
    const saving = reduceAgentBindingMutation(initialAgentBindingMutation, {
      type: "save_started",
      requestedCount: 3,
    })
    const failed = reduceAgentBindingMutation(saving, {
      type: "save_finished",
      appliedCount: 1,
      rejectedCount: 1,
      verified: false,
      recovery: projectAgentReceiptFailure("service_unavailable"),
    })
    expect(failed).toMatchObject({
      state: "failed",
      requestedCount: 3,
      appliedCount: 1,
      rejectedCount: 1,
      requiresRefresh: true,
    })
    expect(() =>
      reduceAgentBindingMutation(failed, { type: "save_started", requestedCount: 1 }),
    ).toThrow("Invalid agent binding mutation transition")
    expect(reduceAgentBindingMutation(failed, { type: "refreshed" })).toEqual(
      initialAgentBindingMutation,
    )
  })
})
