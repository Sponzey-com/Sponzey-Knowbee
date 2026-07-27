import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function readSource(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf-8")
}

describe("task0987 runtime deterministic user-facing boundary", () => {
  it("keeps final completion delivery behind final-response resolution", () => {
    const source = readSource("packages/core/src/runs/finalization.ts")

    expect(source).toContain("resolveCompletionAssistantText")
    expect(source).toContain("resolveStandaloneAssistantText")
    expect(source).toContain('status === "blocked"')
    expect(source).toContain("blocked_by_final_response_rendering")
    expect(source).toContain("user_facing_standalone_delivery_blocked")
  })

  it("keeps known deterministic standalone messages attached to response context", () => {
    const startSource = readSource("packages/core/src/runs/start.ts")
    const rootDriverSource = readSource("packages/core/src/runs/root-run-driver.ts")

    expect(startSource).toContain('textSource: "runtime_deterministic"')
    expect(startSource).toContain("responseContext: params.responseContext")
    expect(rootDriverSource).toContain('textSource: "runtime_deterministic"')
    expect(rootDriverSource).toContain("responseContext: {")
    expect(rootDriverSource).toContain("originalRequest: params.message")
  })

  it("keeps agent terminal failures non-final and non-identity-claiming", () => {
    const noticeSource = readSource("packages/core/src/agent/terminal-failure-notice.ts")
    const agentSource = readSource("packages/core/src/agent/index.ts")

    expect(noticeSource).toContain('renderingRequired: "llm_final_response"')
    expect(noticeSource).toContain("finalAnswer: false")
    expect(noticeSource).toContain("assistantIdentityClaim: false")
    expect(agentSource).toContain("notice: terminalFailure.notice")
  })

  it("keeps Telegram command replies rendered as reviewed text", () => {
    const source = readSource("packages/core/src/channels/telegram/commands.ts")

    expect(source).toContain("renderFinalResponseText")
    expect(source).toContain('textSource: "runtime_deterministic"')
    expect(source).toContain('textSource: "llm_reviewed"')
    expect(source).not.toContain('textSource: "runtime_deterministic",\n  }')
  })
})
