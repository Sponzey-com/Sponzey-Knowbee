import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0996 feature gate availability copy", () => {
  it("keeps planned feature fallback copy focused on availability instead of development state", () => {
    const source = readFileSync("packages/webui/src/components/FeatureGate.tsx", "utf-8")

    expect(source).not.toMatch(/구현 전 단계|not implemented yet/u)
    expect(source).toContain("현재 사용할 수 없습니다. 필요한 조건을 확인한 뒤 다시 시도하세요.")
    expect(source).toContain("This feature is currently unavailable. Check the required conditions before trying again.")
  })
})
