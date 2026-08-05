import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "packages", "webui", "src", "components", "ApprovalModal.tsx"), "utf-8")

describe("task0408 approval modal external tool wording", () => {
  it("uses external tool wording for user approval prompts", () => {
    expect(source).not.toContain('text("도구 실행 승인 필요", "Tool execution approval required")')
    expect(source).not.toContain('text("도구:", "Tool:")')

    expect(source).toContain('text("외부 도구 실행 승인 필요", "External tool execution approval required")')
    expect(source).toContain('text("외부 도구:", "External tool:")')
    expect(source).toContain('type: "approval.respond"')
  })
})
