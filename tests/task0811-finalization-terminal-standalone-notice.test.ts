import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  moveRunToAwaitingUser,
  moveRunToCancelledAfterStop,
} from "../packages/core/src/runs/finalization.ts"

function createDeps() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    rememberRunAwaitingUser: vi.fn(),
    onDeliveryError: vi.fn(),
    deliveryDependencies: {
      now: () => 0,
      createId: () => "message-1",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

describe("task0811 finalization terminal standalone notice", () => {
  it("passes awaiting_user control notice into standalone delivery", async () => {
    const deps = createDeps()

    await moveRunToAwaitingUser({
      runId: "run-awaiting-standalone-notice",
      sessionId: "session-awaiting-standalone-notice",
      source: "telegram",
      onChunk: vi.fn().mockResolvedValue(undefined),
      awaitingUser: {
        preview: "",
        summary: "추가 입력 필요",
        userMessage: "계속하려면 파일명을 알려 주세요.",
      },
      textSource: "llm_generated",
      dependencies: deps,
    })

    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      "run-awaiting-standalone-notice",
      "user_facing_standalone_notice:terminal_control_notice:non_final",
    )
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      "run-awaiting-standalone-notice",
      "user_facing_standalone_text_source:llm_generated",
    )
  })

  it("passes stop control notice into standalone delivery before blocked deterministic delivery", async () => {
    const deps = createDeps()

    await moveRunToCancelledAfterStop({
      runId: "run-stop-standalone-notice",
      sessionId: "session-stop-standalone-notice",
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      cancellation: {
        preview: "",
        summary: "자동 진행 중단",
        reason: "권한 승인이 없습니다.",
      },
      dependencies: deps,
    })

    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      "run-stop-standalone-notice",
      "user_facing_standalone_notice:terminal_control_notice:non_final",
    )
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      "run-stop-standalone-notice",
      "user_facing_standalone_delivery_blocked:missing_context",
    )
  })

  it("routes finalization terminal deliveries through the terminal notice builder", () => {
    const source = readFileSync(join(process.cwd(), "packages/core/src/runs/finalization.ts"), "utf-8")

    expect(source).toContain("buildTerminalControlNotice")
    expect(source).toContain("notice: buildTerminalControlNotice")
  })
})
