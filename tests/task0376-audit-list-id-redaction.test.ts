import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "pages", "AuditPage.tsx"),
  "utf-8",
)

describe("task0376 audit list ID redaction", () => {
  it("does not render run or request group ids directly in audit list cards", () => {
    expect(source).not.toContain("run={event.runId}")
    expect(source).not.toContain("group={event.requestGroupId}")
    expect(source).toContain("실행 연결됨")
    expect(source).toContain("요청 흐름 연결됨")
  })
})
