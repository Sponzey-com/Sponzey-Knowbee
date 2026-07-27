import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const checksSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "SetupChecksPanel.tsx"),
  "utf-8",
)
const assistSource = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "SetupAssistPanel.tsx"),
  "utf-8",
)

describe("task0397 setup check and assist wording", () => {
  it("uses user-facing labels in the setup checks panel", () => {
    expect(checksSource).not.toContain("로컬 제어면 체크")
    expect(checksSource).not.toContain("Local Control Plane Check")
    expect(checksSource).not.toContain("Setup 완료")
    expect(checksSource).not.toContain("Setup Complete")
    expect(checksSource).not.toContain("Telegram 토큰")
    expect(checksSource).not.toContain("Telegram Token")
    expect(checksSource).not.toContain("WebUI 인증")
    expect(checksSource).not.toContain("WebUI Authentication")
    expect(checksSource).not.toContain('label="Scheduler"')
    expect(checksSource).not.toContain("Config file")
    expect(checksSource).not.toContain("Setup state")
    expect(checksSource).toContain("초기 설정 점검")
    expect(checksSource).toContain("Initial setup check")
    expect(checksSource).toContain("초기 설정 완료")
    expect(checksSource).toContain("텔레그램 연결 정보")
    expect(checksSource).toContain("화면 접속 보호")
    expect(checksSource).toContain("예약 실행")
    expect(checksSource).toContain("설정 저장")
    expect(checksSource).toContain("진행 상태 저장")
  })

  it("uses the same user-facing labels in the setup assist panel", () => {
    expect(assistSource).not.toContain("Setup Complete")
    expect(assistSource).not.toContain("Telegram Configuration")
    expect(assistSource).not.toContain("Web Authentication")
    expect(assistSource).not.toContain('label="Scheduler"')
    expect(assistSource).not.toContain("Not Ready")
    expect(assistSource).toContain("Initial setup complete")
    expect(assistSource).toContain("Telegram connection")
    expect(assistSource).toContain("Web app protection")
    expect(assistSource).toContain("Scheduled execution")
    expect(assistSource).toContain("Not ready")
  })
})
