import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1004 runtime unsupported feature copy", () => {
  it("keeps runtime unsupported-feature messages free of implementation roadmap wording", () => {
    const registry = readFileSync("packages/core/src/mcp/registry.ts", "utf-8")
    const broadcast = readFileSync("packages/core/src/tools/builtin/yeonjang-broadcast.ts", "utf-8")
    const combined = `${registry}\n${broadcast}`

    expect(combined).not.toContain("아직 구현되지 않았습니다")
    expect(combined).not.toContain("task004 baseline")
    expect(registry).toContain("HTTP 방식 외부 기능 연결은 현재 사용할 수 없습니다. 지금은 stdio 방식만 사용할 수 있습니다.")
    expect(broadcast).toContain("broadcast는 현재 사용할 수 없습니다. 지금은 screen_capture만 전체 실행을 지원합니다.")
  })
})
