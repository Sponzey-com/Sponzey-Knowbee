import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "AuditPage.tsx"),
  "utf-8",
)

describe("task0380 audit filter placeholder redaction", () => {
  it("uses user-facing scope labels instead of raw id placeholders", () => {
    expect(source).not.toContain('placeholder="run id"')
    expect(source).not.toContain('placeholder="agent id"')
    expect(source).not.toContain('placeholder="team id"')
    expect(source).not.toContain('placeholder="session id"')
    expect(source).toContain('text("실행 범위", "Run scope")')
    expect(source).toContain('text("에이전트 범위", "Agent scope")')
    expect(source).toContain('text("팀 범위", "Team scope")')
    expect(source).toContain('text("대화 범위", "Conversation scope")')
  })
})
