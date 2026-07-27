import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "packages", "webui", "src", "components", "ActiveInstructionsPanel.tsx"),
  "utf-8",
)

describe("task0393 active instructions user-facing wording", () => {
  it("does not use gateway/runtime/instruction-chain jargon in default panel copy", () => {
    expect(source).not.toContain("현재 gateway가 실제로 합쳐서 사용하는 instruction chain")
    expect(source).not.toContain("The instruction chain currently merged and used by the gateway")
    expect(source).not.toContain("runtime 조립 상태와 안전 점검")
    expect(source).not.toContain("Runtime assembly status and safety checks")
    expect(source).toContain("현재 앱이 적용 중인 지침 묶음을 확인합니다.")
    expect(source).toContain("Review the instruction set currently applied by the app.")
    expect(source).toContain("적용 상태와 안전 점검 결과를 확인합니다.")
    expect(source).toContain("Review applied state and safety checks.")
  })

  it("uses user-facing validation labels instead of locale and regression badges", () => {
    expect(source).not.toContain("locale 점검 필요")
    expect(source).not.toContain("locale 정상")
    expect(source).not.toContain("Locale check needed")
    expect(source).not.toContain("Locale OK")
    expect(source).not.toContain("regression 실패")
    expect(source).not.toContain("regression 정상")
    expect(source).not.toContain("Regression failed")
    expect(source).not.toContain("Regression OK")
    expect(source).toContain("언어 점검 필요")
    expect(source).toContain("언어 점검 정상")
    expect(source).toContain("변경 검증 실패")
    expect(source).toContain("변경 검증 정상")
  })

  it("hides prompt source checksums and paths in user-facing summaries", () => {
    expect(source).not.toContain('source.checksum.startsWith("[") ? hiddenValue : source.checksum.slice(0, 12)')
    expect(source).not.toContain('source.path.startsWith("[") ? hiddenValue : source.path')
    expect(source).not.toContain("promptSourceDocument.checksum.slice(0, 12)")
    expect(source).not.toContain("promptSourceResult.diff.beforeChecksum.slice")
    expect(source).not.toContain("promptSourceResult.diff.afterChecksum.slice")
    expect(source).not.toContain('{issue.sourceId ? `${issue.sourceId}:${issue.locale ?? "all"} · ` : ""}')
    expect(source).toContain("검증 기준 연결됨")
    expect(source).toContain("Check baseline linked")
    expect(source).toContain("저장 위치는 일반 화면에 표시하지 않습니다.")
    expect(source).toContain("Storage location is hidden in the default view.")
    expect(source).toContain("검증 기준 갱신됨")
    expect(source).toContain("Check baseline updated")
  })
})
