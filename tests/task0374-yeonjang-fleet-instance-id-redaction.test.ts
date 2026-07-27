import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "setup", "YeonjangFleetPanel.tsx"),
  "utf-8",
)

describe("task0374 Yeonjang fleet instance ID redaction", () => {
  it("uses names and connection states instead of rendering raw instance or session ids", () => {
    expect(source).not.toContain('label={text("인스턴스 ID", "Instance ID")}')
    expect(source).not.toContain('label={text("세션 ID", "Session ID")}')
    expect(source).not.toContain("value={instance.instanceId}")
    expect(source).not.toContain("value={instance.session?.sessionId")
    expect(source).not.toContain("instance.instanceAlias || instance.displayName || instance.nodeId")
    expect(source).toContain('text("연장 이름", "Extension name")')
    expect(source).toContain('text("연결 세션", "Connection session")')
    expect(source).toContain('text("이름 없는 연장", "Unnamed Yeonjang")')
  })
})
