import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task019 installer release workflow", () => {
  it("builds five native bundles and prepares an unsigned candidate", () => {
    const workflow = readFileSync(".github/workflows/npm-release.yml", "utf8")
    expect(workflow).toContain("prepare-installer-inputs:")
    expect(workflow).toContain("build-installer-bundles:")
    expect(workflow).toContain("prepare-installer-candidate:")
    for (const target of ["darwin-arm64", "darwin-x64", "linux-x64", "win32-arm64", "win32-x64"]) {
      expect(workflow).toContain(`installer_target: ${target}`)
    }
    expect(workflow).toContain("node scripts/prepare-installer-inputs.mjs")
    expect(workflow).toContain("node scripts/build-installer-bundle.mjs")
    expect(workflow).toContain("node scripts/compose-installer-release.mjs prepare")
    expect(workflow).not.toMatch(/PRIVATE_KEY|SIGNING_PRIVATE/iu)
  })

  it("publishes unsigned installer assets only in the protected finalizer", () => {
    const workflow = readFileSync(".github/workflows/installer-release-finalize.yml", "utf8")
    expect(workflow).toContain("environment: installer-release-publish")
    expect(workflow).toContain("node scripts/compose-installer-release.mjs finalize")
    expect(workflow).toContain("--prerelease")
    expect(workflow).toContain("installer-release-gate.json")
    expect(workflow).not.toMatch(/PRIVATE_KEY|SIGNING_PRIVATE/iu)
    expect(workflow).not.toMatch(/(?:signature|public-key|signing-response)/iu)
    expect(workflow).not.toMatch(/--latest|make_latest/iu)
  })

  it("never overwrites a stable release and publishes npm packages only from a tag", () => {
    const workflow = readFileSync(".github/workflows/npm-release.yml", "utf8")
    expect(workflow).toMatch(/github-release:\n\s+if: startsWith\(github\.ref, 'refs\/tags\/'\)/u)
    expect(workflow).toContain(
      'test "$(gh release view "$GITHUB_REF_NAME" --json isPrerelease --jq .isPrerelease)" = true',
    )
    expect(workflow).toMatch(/\n\s+publish:\n\s+if: startsWith\(github\.ref, 'refs\/tags\/'\)/u)
  })
})
