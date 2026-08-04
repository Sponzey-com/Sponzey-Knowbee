import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf8")
}

describe("task100 artifact cleanup docs and smoke", () => {
  it("documents artifact cleanup CLI usage in English and Korean README files", () => {
    const english = source("README.md")
    const korean = source("README.ko.md")

    for (const document of [english, korean]) {
      expect(document).toContain("knowbee admin artifact-cleanup --json")
      expect(document).toContain("knowbee admin artifact-cleanup --release-output-dir")
      expect(document).toContain('knowbee admin artifact-cleanup --execute --confirm "CONFIRM ARTIFACT CLEANUP"')
      expect(document).toContain("knowbee admin artifact-cleanup --audit --json")
      expect(document).toContain("scripts/self/smoke-artifact-cleanup-cli.mjs")
      expect(document).not.toContain("reasonCounts are shown by default")
      expect(document).not.toContain("기본 출력에서 reasonCounts")
    }

    expect(english).toContain("Artifact cleanup")
    expect(english).toContain("Preview does not delete files")
    expect(english).toContain("The default output hides internal reason codes and file paths.")
    expect(korean).toContain("결과물 정리")
    expect(korean).toContain("미리보기는 파일을 삭제하지 않습니다.")
    expect(korean).toContain("기본 출력은 내부 reason code와 파일 경로를 숨깁니다.")
  })

  it("keeps the installed CLI smoke on preview and confirmation-failure paths by default", () => {
    const script = source("scripts/self/smoke-artifact-cleanup-cli.mjs")
    const packageJson = source("package.json")

    expect(script).toContain("admin")
    expect(script).toContain("artifact-cleanup")
    expect(script).toContain("--json")
    expect(script).toContain("--execute")
    expect(script).toContain("WRONG CONFIRMATION")
    expect(script).toContain("artifact_cleanup_confirmation_required")
    expect(script).toContain("does not run destructive success cleanup")
    expect(script).not.toContain('CONFIRM ARTIFACT CLEANUP"]')
    expect(script).not.toContain("--audit")
    expect(packageJson).toContain('"smoke:artifact-cleanup-cli"')
  })
})
