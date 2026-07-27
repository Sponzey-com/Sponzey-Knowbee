import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1003 capability reason future-phase copy", () => {
  it("keeps capability reasons focused on current availability instead of internal roadmap state", () => {
    const controlPlane = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const uiI18n = readFileSync("packages/webui/src/lib/ui-i18n.ts", "utf-8")

    for (const source of [controlPlane, uiI18n]) {
      expect(source).not.toMatch(/후속 Phase|아직 정리 중|아직 완료되지 않았|will be added later|still being finalized|not complete yet/u)
    }

    expect(controlPlane).toContain("채팅은 현재 완료 응답 방식으로 제공됩니다. 토큰 단위 실시간 표시는 사용할 수 없습니다.")
    expect(controlPlane).toContain("세션별/요청별 AI override는 현재 사용할 수 없습니다. 기본 AI 설정을 사용하세요.")
    expect(controlPlane).toContain("플러그인 런타임은 현재 WebUI에서 직접 제어할 수 없습니다. 기존 실행 경로를 사용하세요.")
    expect(controlPlane).toContain("시맨틱 메모리/검색 제어는 현재 사용할 수 없습니다. 기본 메모리 기능을 사용하세요.")
  })
})
