import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task101 artifact cleanup destructive fixture smoke", () => {
  it("keeps destructive cleanup smoke isolated behind an explicit fixture flag", () => {
    const script = readFileSync("scripts/self/smoke-artifact-cleanup-cli.mjs", "utf8")
    const readme = readFileSync("README.md", "utf8")
    const readmeKo = readFileSync("README.ko.md", "utf8")

    expect(script).toContain("--destructive-fixture")
    expect(script).toContain("runDestructiveFixtureSmoke")
    expect(script).toContain('"CONFIRM ARTIFACT CLEANUP"')
    expect(script).toContain("manifest.json")
    expect(script).toContain("SHA256SUMS")
    expect(script).toContain("payload")
    expect(script).toContain("rogue.txt")
    expect(script).toContain("symlink")
    expect(script).toContain("assertNoInternalCleanupDetails")
    expect(script).toContain("audit_logs")
    expect(script).toContain("[explicit-release-output]")

    expect(readme).toContain("node scripts/self/smoke-artifact-cleanup-cli.mjs --destructive-fixture")
    expect(readme).toContain("The destructive fixture smoke uses only a temporary release output directory.")
    expect(readmeKo).toContain("node scripts/self/smoke-artifact-cleanup-cli.mjs --destructive-fixture")
    expect(readmeKo).toContain("destructive fixture smoke는 임시 릴리스 출력 폴더만 사용합니다.")
  })
})
