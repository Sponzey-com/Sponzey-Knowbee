import { describe, expect, it } from "vitest"
import {
  buildTelegramCommandResponse,
  resolveTelegramCommandResponseLanguage,
} from "../packages/core/src/channels/telegram/commands.ts"

describe("task0833 Telegram command response language boundary", () => {
  it("resolves Telegram Korean language codes to Korean command responses", () => {
    expect(resolveTelegramCommandResponseLanguage("ko")).toBe("ko")
    expect(resolveTelegramCommandResponseLanguage("ko-KR")).toBe("ko")
    expect(resolveTelegramCommandResponseLanguage("en")).toBe("en")
    expect(resolveTelegramCommandResponseLanguage(undefined)).toBe("en")
  })

  it("builds Korean start/help/status command notices", () => {
    const start = buildTelegramCommandResponse({
      command: "start",
      language: "ko",
      userFirstName: "마당쇠",
    })
    const help = buildTelegramCommandResponse({ command: "help", language: "ko" })
    const status = buildTelegramCommandResponse({
      command: "status",
      language: "ko",
      sessionKey: "telegram:1:main",
      runningCount: 1,
      status: {
        sessionId: "session-1",
        runId: "run-1",
        running: true,
      },
    })

    expect(start.language).toBe("ko")
    expect(start.notice.language).toBe("ko")
    expect(start.text).toContain("마당쇠님")
    expect(start.text).toContain("채널이 연결되었습니다")
    expect(help.text).toContain("명령 목록")
    expect(status.text).toContain("*세션 상태*")
    expect(status.text).toContain("실행 중: 예")
  })

  it("builds Korean new and cancel command notices", () => {
    expect(buildTelegramCommandResponse({ command: "new", language: "ko" }).text)
      .toContain("새 대화 세션")
    expect(buildTelegramCommandResponse({ command: "cancel", language: "ko", aborted: true }).text)
      .toContain("취소했습니다")
    expect(buildTelegramCommandResponse({ command: "cancel", language: "ko", aborted: false }).text)
      .toContain("실행 중인 작업이 없습니다")
  })
})
